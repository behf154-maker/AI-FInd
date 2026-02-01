const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

class PythonAIService {
  constructor() {
    // Python service endpoint (local)
    this.serviceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:5000';
    this.enabled = process.env.USE_PYTHON_AI === 'true';
    
    if (this.enabled) {
      console.log('✅ Python AI Service enabled');
      console.log(`   Service URL: ${this.serviceUrl}`);
      console.log(`   ⚠️  Make sure Python service is running and PyTorch is working`);
    } else {
      console.log('ℹ️  Python AI Service disabled (optional - using HuggingFace Mirror instead)');
      console.log(`   To enable: Set USE_PYTHON_AI=true in .env (after fixing PyTorch DLL issue)`);
    }
  }

  /**
   * Check if Python service is available
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.serviceUrl}/health`, {
        timeout: 5000,
      });
      return response.data.model_loaded === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract features from image using local Python service
   */
  async extractImageFeatures(imagePath) {
    if (!this.enabled) {
      return null;
    }

    try {
      // Check if service is available
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        console.warn('⚠️ Python AI service is not available');
        return null;
      }

      console.log('🤖 Using Local Python AI (Transformers) to analyze image...');
      
      // Read image file
      const imageBuffer = fs.readFileSync(imagePath);
      
      // Create form data
      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      });

      // Send request to Python service
      const response = await axios.post(
        `${this.serviceUrl}/classify`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 30000, // 30 seconds
        }
      );

      const result = response.data;
      
      if (result.labels && result.labels.length > 0) {
        console.log('✅ Python AI Results:');
        console.log('   Labels:', result.labels.map(l => 
          `${l.description} (${(l.confidence * 100).toFixed(1)}%)`
        ).join(', '));

        return {
          labels: result.labels,
          colors: result.colors || [],
          objects: result.objects || result.labels.slice(0, 5),
          confidence: result.confidence || 0,
          source: 'local_transformers',
          model: result.model || 'google/vit-base-patch16-224',
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Python AI Service Error:', error.message);
      if (error.code === 'ECONNREFUSED') {
        console.warn('   → Python service is not running. Start it with:');
        console.warn('      cd backend/python_service && python image_classifier.py');
      }
      return null;
    }
  }

  /**
   * Extract features from image URL
   */
  async extractImageFeaturesFromUrl(imageUrl) {
    if (!this.enabled) {
      return null;
    }

    try {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        return null;
      }

      console.log('🤖 Using Local Python AI to analyze image from URL...');

      const response = await axios.post(
        `${this.serviceUrl}/classify_url`,
        { url: imageUrl },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );

      const result = response.data;
      
      if (result.labels && result.labels.length > 0) {
        return {
          labels: result.labels,
          colors: result.colors || [],
          objects: result.objects || result.labels.slice(0, 5),
          confidence: result.confidence || 0,
          source: 'local_transformers',
          model: result.model || 'google/vit-base-patch16-224',
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Python AI URL Error:', error.message);
      return null;
    }
  }
}

module.exports = new PythonAIService();

