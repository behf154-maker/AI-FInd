"""
HuggingFace Transformers Image Classification Service
Local AI service using transformers library - FREE, no API limits
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import sys

# Try to import transformers - handle import errors gracefully
try:
    from transformers import pipeline
except ImportError as e:
    print(f"❌ Error importing transformers: {e}")
    print("   Please install: pip install transformers")
    sys.exit(1)

# Try to import torch - handle DLL errors
try:
    import torch
except OSError as e:
    print(f"❌ Error loading PyTorch: {e}")
    print("   This is usually a DLL issue on Windows.")
    print("   Solution: Run fix_pytorch.bat to reinstall PyTorch CPU-only")
    sys.exit(1)
except ImportError as e:
    print(f"❌ Error importing PyTorch: {e}")
    print("   Please install: pip install torch --index-url https://download.pytorch.org/whl/cpu")
    sys.exit(1)

app = Flask(__name__)
CORS(app)  # Enable CORS for Node.js backend

# Global classifier - loaded once at startup
classifier = None

def load_model(model_name="google/vit-base-patch16-224"):
    """Load the image classification model"""
    global classifier
    try:
        print(f"🤖 Loading model: {model_name}...")
        print("   (This may take a few minutes on first run - downloading ~346MB)")
        
        classifier = pipeline(
            "image-classification",
            model=model_name,
            device=-1  # Use CPU (-1) or GPU (0, 1, ...)
        )
        
        print(f"✅ Model '{model_name}' loaded successfully!")
        return True
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        return False

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'model_loaded': classifier is not None
    })

@app.route('/classify', methods=['POST'])
def classify_image():
    """Classify an image and return labels"""
    try:
        if classifier is None:
            return jsonify({
                'error': 'Model not loaded',
                'labels': []
            }), 500

        # Get image from request
        if 'image' not in request.files:
            return jsonify({
                'error': 'No image file provided',
                'labels': []
            }), 400

        image_file = request.files['image']
        
        # Open and process image
        image = Image.open(io.BytesIO(image_file.read()))
        
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Classify image
        print("🔍 Classifying image...")
        results = classifier(image)
        
        # Format results
        labels = []
        for result in results[:10]:  # Top 10 results
            labels.append({
                'description': result['label'],
                'confidence': result['score']
            })
        
        print(f"✅ Classification complete: {len(labels)} labels found")
        print(f"   Top 3: {', '.join([l['description'] for l in labels[:3]])}")
        
        return jsonify({
            'labels': labels,
            'colors': [],  # Can be added later with color extraction
            'objects': labels[:5],  # Top 5 as objects
            'confidence': labels[0]['confidence'] if labels else 0,
            'source': 'local_transformers',
            'model': os.getenv('HF_MODEL', 'google/vit-base-patch16-224')
        })
        
    except Exception as e:
        print(f"❌ Classification error: {e}")
        return jsonify({
            'error': str(e),
            'labels': []
        }), 500

@app.route('/classify_url', methods=['POST'])
def classify_image_url():
    """Classify an image from URL"""
    try:
        if classifier is None:
            return jsonify({
                'error': 'Model not loaded',
                'labels': []
            }), 500

        data = request.get_json()
        if 'url' not in data:
            return jsonify({
                'error': 'No image URL provided',
                'labels': []
            }), 400

        import requests
        from io import BytesIO
        
        # Download image
        response = requests.get(data['url'], timeout=10)
        response.raise_for_status()
        
        # Open and process image
        image = Image.open(BytesIO(response.content))
        
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Classify
        print("🔍 Classifying image from URL...")
        results = classifier(image)
        
        # Format results
        labels = []
        for result in results[:10]:
            labels.append({
                'description': result['label'],
                'confidence': result['score']
            })
        
        return jsonify({
            'labels': labels,
            'colors': [],
            'objects': labels[:5],
            'confidence': labels[0]['confidence'] if labels else 0,
            'source': 'local_transformers',
            'model': os.getenv('HF_MODEL', 'google/vit-base-patch16-224')
        })
        
    except Exception as e:
        print(f"❌ Classification error: {e}")
        return jsonify({
            'error': str(e),
            'labels': []
        }), 500

if __name__ == '__main__':
    # Get model name from environment or use default
    model_name = os.getenv('HF_MODEL', 'google/vit-base-patch16-224')
    
    # Load model at startup
    if not load_model(model_name):
        print("❌ Failed to load model. Exiting...")
        sys.exit(1)
    
    # Get port from environment or use default
    port = int(os.getenv('PYTHON_SERVICE_PORT', 5000))
    
    print(f"\n🚀 Python Image Classification Service starting...")
    print(f"   Model: {model_name}")
    print(f"   Port: {port}")
    print(f"   Endpoint: http://localhost:{port}/classify\n")
    
    app.run(host='0.0.0.0', port=port, debug=False)

