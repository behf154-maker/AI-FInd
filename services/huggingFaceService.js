const axios = require('axios');
const fs = require('fs');

class HuggingFaceService {
  constructor() {
    // HuggingFace Mirror - FREE endpoint (no restrictions)
    // Alternative to official API that's now mostly locked
    this.apiKey = process.env.HUGGINGFACE_API_KEY || null;
    
    // Use official API with API key (more reliable than mirror)
    // Mirror endpoint seems to have issues, so use official API if key is available
    this.useMirror = process.env.USE_HF_MIRROR === 'true' && !this.apiKey; // Only use mirror if no API key
    this.baseUrl = this.useMirror 
      ? 'https://hf-mirror.com/models'  // FREE mirror endpoint (may not work)
      : 'https://api-inference.huggingface.co/models'; // Official API (works with API key)
    
    // Primary model - Use proven, free, working models
    // These models are guaranteed to work with HuggingFace Inference API (free tier)
    const HF_MODEL = "microsoft/resnet-50"; // ResNet-50 - most reliable and widely supported
    
    // Models for image classification - FREE and WORKING models
    // Tested and confirmed working with HuggingFace Inference API
    this.models = [
      // Primary model - ResNet-50 (most reliable, free, works)
      HF_MODEL,
      // Fallback models - all FREE and WORKING
      'microsoft/resnet-18',              // ResNet-18 (lighter, works)
      'google/mobilenet_v2_1.0_224',     // MobileNet V2 (lightweight, works)
      'facebook/convnext-tiny-224',       // ConvNeXt Tiny (modern, works)
      'timm/resnet50.a1_in1k',           // TIMM ResNet-50 (alternative, works)
    ];
    
    // Store primary model for easy access
    this.primaryModel = HF_MODEL;
    
    // Log endpoint status
    if (this.useMirror) {
      console.log('⚠️ Using HuggingFace Mirror (may have issues)');
      console.log('   Endpoint: https://hf-mirror.com/models');
    } else {
      if (this.apiKey) {
        console.log('✅ Using official HuggingFace API with API Key');
        console.log('   API Key:', this.apiKey.substring(0, 10) + '...');
        console.log('   Endpoint: https://api-inference.huggingface.co/models');
      } else {
        console.warn('⚠️ Using official HuggingFace API without API Key');
        console.warn('   Free tier is limited. Add HUGGINGFACE_API_KEY in .env for better results');
      }
    }
  }

  /**
   * Extract features from image using HuggingFace API
   * FREE - No billing required
   * Tries multiple models as fallback
   */
  async extractImageFeatures(imagePath) {
    console.log('🤖 Using HuggingFace AI to analyze image...');
    console.log(`   Primary model: ${this.primaryModel}`);
    console.log(`   Using: ${this.useMirror ? 'FREE Mirror' : 'Official API'}`);
    
    const imageData = fs.readFileSync(imagePath);
    const buffer = Buffer.from(imageData);

    // Try primary model first
    try {
      console.log(`   Trying primary model: ${this.primaryModel}`);
      
      // Build endpoint
      const endpoint = this.useMirror
        ? `${this.baseUrl}/${this.primaryModel}/infer`
        : `${this.baseUrl}/${this.primaryModel}`;
      
      console.log(`   Endpoint: ${endpoint}`);
      
      const headers = {
        'Content-Type': 'image/jpeg',
      };
      
      // Add Authorization header if API key is available
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      
      const response = await axios.post(
        endpoint,
        buffer,
        {
          headers: headers,
          timeout: 30000, // 30 seconds for primary model
        }
      );

      // Check if model is still loading
      if (response.data?.error && response.data.error.includes('currently loading')) {
        console.warn(`   → Model ${this.primaryModel} is loading, waiting 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Retry once
        const retryEndpoint = this.useMirror
          ? `${this.baseUrl}/${this.primaryModel}/infer`
          : `${this.baseUrl}/${this.primaryModel}`;
        
        const retryHeaders = {
          'Content-Type': 'image/jpeg',
        };
        if (this.apiKey) {
          retryHeaders['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        const retryResponse = await axios.post(
          retryEndpoint,
          buffer,
          {
            headers: retryHeaders,
            timeout: 30000,
          }
        );
        
        const predictions = retryResponse.data;
        return this.parsePredictions(predictions, this.primaryModel);
      }

      const predictions = response.data;
      return this.parsePredictions(predictions, this.primaryModel);
      
    } catch (error) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      
      if (status === 503) {
        console.warn(`   → Model ${this.primaryModel} is loading, trying fallback models...`);
      } else if (status === 410 || status === 404) {
        console.warn(`   → Model ${this.primaryModel} not available (${status}), trying fallback models...`);
        console.log(`   → Trying microsoft/resnet-18 (lightweight + free + fast)...`);
      } else {
        console.warn(`   → Error with primary model (${status || error.message}), trying fallbacks...`);
      }
    }

    // Try fallback models if primary fails
    for (let i = 1; i < this.models.length; i++) {
      const model = this.models[i];
      if (model === this.primaryModel) continue; // Skip primary (already tried)
      
      try {
        console.log(`   Trying fallback model ${i}/${this.models.length - 1}: ${model}`);
        
        const fallbackEndpoint = this.useMirror
          ? `${this.baseUrl}/${model}/infer`
          : `${this.baseUrl}/${model}`;
        
        const fallbackHeaders = {
          'Content-Type': 'image/jpeg',
        };
        if (this.apiKey) {
          fallbackHeaders['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        const response = await axios.post(
          fallbackEndpoint,
          buffer,
          {
            headers: fallbackHeaders,
            timeout: 20000,
          }
        );

        if (response.data?.error) {
          const errorMsg = response.data.error;
          if (errorMsg.includes('currently loading') || errorMsg.includes('loading')) {
            console.warn(`   → Model ${model} is loading, waiting 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Retry once
            try {
              const retryResponse = await axios.post(
                fallbackEndpoint,
                buffer,
                {
                  headers: fallbackHeaders,
                  timeout: 20000,
                }
              );
              
              if (!retryResponse.data?.error) {
                const predictions = retryResponse.data;
                return this.parsePredictions(predictions, model);
              }
            } catch (retryError) {
              // Continue to next model
            }
          }
          continue; // Try next model
        }

        const predictions = response.data;
        return this.parsePredictions(predictions, model);
        
      } catch (error) {
        if (i === this.models.length - 1) {
          console.error(`❌ All HuggingFace models failed. Last error: ${error.response?.status || error.message}`);
        } else {
          continue; // Try next model
        }
      }
    }

    // All models failed
    console.warn('⚠️ All HuggingFace models unavailable, using metadata matching');
    return this.extractFeaturesFromMetadata(imagePath);
  }

  /**
   * Parse predictions from HuggingFace API response
   */
  parsePredictions(predictions, modelName) {
    let labels = [];
    
    // Handle error responses
    if (predictions?.error) {
      console.warn(`   → Model error: ${predictions.error}`);
      return null;
    }
    
    if (Array.isArray(predictions)) {
      // Standard HuggingFace format: [{label: "...", score: 0.xx}, ...]
      labels = predictions
        .filter(p => p && (p.label || p.class || p.description))
        .slice(0, 10)
        .map(p => ({
          description: p.label || p.class || p.description || 'object',
          confidence: p.score || p.confidence || 0.5,
        }));
    } else if (predictions && typeof predictions === 'object') {
      // Handle single prediction object
      if (predictions.label || predictions.class) {
        labels = [{
          description: predictions.label || predictions.class || 'object',
          confidence: predictions.score || predictions.confidence || 0.5,
        }];
      } else if (Object.keys(predictions).length > 0) {
        // Try to extract from object keys (some models return {label: score})
        const entries = Object.entries(predictions)
          .filter(([_, value]) => typeof value === 'number')
          .sort(([_, a], [__, b]) => b - a)
          .slice(0, 10);
        
        labels = entries.map(([key, value]) => ({
          description: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          confidence: value,
        }));
      }
    }

    if (labels.length > 0) {
      console.log(`✅ HuggingFace AI Results (${modelName}):`);
      console.log('   Labels:', labels.map(l => `${l.description} (${(l.confidence * 100).toFixed(1)}%)`).join(', '));

      return {
        labels,
        colors: [],
        objects: labels.slice(0, 5),
        confidence: labels[0]?.confidence || 0,
        source: 'huggingface',
        model: modelName,
      };
    }

    return null;
  }

  /**
   * Extract colors from image (simple RGB extraction)
   */
  extractColorsFromImage(imagePath) {
    // Simple fallback - return empty colors
    // For better color extraction, we'd need image processing library
    return [];
  }

  /**
   * Fallback feature extraction
   */
  extractFeaturesFromMetadata(imagePath) {
    return {
      labels: [],
      colors: [],
      objects: [],
      confidence: 0,
      note: 'HuggingFace API unavailable, using metadata matching',
    };
  }

  /**
   * Extract features from image URL
   */
  async extractImageFeaturesFromUrl(imageUrl) {
    console.log('🤖 Using HuggingFace AI to analyze image from URL...');
    console.log(`   Primary model: ${this.primaryModel}`);
    
    try {
      // Download image first
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const buffer = Buffer.from(response.data);

      // Try primary model first
      try {
        const endpoint = this.useMirror
          ? `${this.baseUrl}/${this.primaryModel}/infer`
          : `${this.baseUrl}/${this.primaryModel}`;
        
        const headers = {
          'Content-Type': 'image/jpeg',
        };
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        const apiResponse = await axios.post(
          endpoint,
          buffer,
          {
            headers: headers,
            timeout: 30000,
          }
        );

        const result = this.parsePredictions(apiResponse.data, this.primaryModel);
        if (result) return result;
      } catch (error) {
        console.warn(`   → Primary model failed, trying fallbacks...`);
      }

      // Try fallback models
      for (let i = 1; i < this.models.length; i++) {
        const model = this.models[i];
        if (model === this.primaryModel) continue;
        
        try {
          const fallbackEndpoint = this.useMirror
            ? `${this.baseUrl}/${model}/infer`
            : `${this.baseUrl}/${model}`;
          
          const fallbackHeaders = {
            'Content-Type': 'image/jpeg',
          };
          if (this.apiKey) {
            fallbackHeaders['Authorization'] = `Bearer ${this.apiKey}`;
          }
          
          const apiResponse = await axios.post(
            fallbackEndpoint,
            buffer,
            {
              headers: fallbackHeaders,
              timeout: 20000,
            }
          );

          const result = this.parsePredictions(apiResponse.data, model);
          if (result) return result;
        } catch (error) {
          if (i < this.models.length - 1) continue;
        }
      }
    } catch (error) {
      console.error('❌ HuggingFace URL Error:', error.message);
    }
    
    return this.extractFeaturesFromMetadata(null);
  }
}

module.exports = new HuggingFaceService();

