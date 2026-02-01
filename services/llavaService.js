const axios = require('axios');
const fs = require('fs');

class LLaVAService {
  constructor() {
    // LLaVA models on HuggingFace
    this.apiKey = process.env.HUGGINGFACE_API_KEY || null;
    this.baseUrl = 'https://api-inference.huggingface.co/models';
    
    // LLaVA models - different sizes
    this.models = [
      'llava-hf/llava-1.5-7b-hf',           // LLaVA 1.5 7B (best quality)
      'llava-hf/llava-1.5-13b-hf',          // LLaVA 1.5 13B (higher quality)
      'llava-hf/llava-1.6-mistral-7b-hf',   // LLaVA 1.6 Mistral (latest)
      'llava-hf/llava-1.6-vicuna-7b-hf',    // LLaVA 1.6 Vicuna
    ];
    
    this.primaryModel = this.models[0]; // Use 7B by default (faster)
    
    if (this.apiKey) {
      console.log('✅ LLaVA Service enabled');
      console.log(`   Primary model: ${this.primaryModel}`);
      console.log(`   API Key: ${this.apiKey.substring(0, 10)}...`);
    } else {
      console.warn('⚠️ LLaVA Service: API Key not found');
      console.warn('   Add HUGGINGFACE_API_KEY in .env to use LLaVA');
    }
  }

  /**
   * Extract features from image using LLaVA
   * LLaVA provides detailed image descriptions
   */
  async extractImageFeatures(imagePath) {
    if (!this.apiKey) {
      return null;
    }

    try {
      console.log('🤖 Using LLaVA AI to analyze image...');
      console.log(`   Model: ${this.primaryModel}`);
      
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString('base64');
      
      // LLaVA prompt for object detection and description
      const prompt = "Describe this image in detail. List all objects, their colors, sizes, and any distinctive features. Focus on items that could be lost or found.";
      
      // Try primary model first
      // LLaVA on HuggingFace uses image + text format
      try {
        // Send image as multipart or base64 in the request body
        const response = await axios.post(
          `${this.baseUrl}/${this.primaryModel}`,
          {
            inputs: {
              image: base64Image, // Base64 image data
              prompt: prompt,
            },
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000, // 60 seconds (LLaVA can be slow)
          }
        );

        const result = this.parseLLaVAResponse(response.data);
        if (result) {
          return result;
        }
      } catch (error) {
        if (error.response?.status === 503) {
          console.warn(`   → Model ${this.primaryModel} is loading, waiting 10 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // Retry once
          try {
            const retryResponse = await axios.post(
              `${this.baseUrl}/${this.primaryModel}`,
              {
                inputs: {
                  image: base64Image,
                  prompt: prompt,
                },
              },
              {
                headers: {
                  'Authorization': `Bearer ${this.apiKey}`,
                  'Content-Type': 'application/json',
                },
                timeout: 60000,
              }
            );
            
            const result = this.parseLLaVAResponse(retryResponse.data);
            if (result) return result;
          } catch (retryError) {
            console.warn(`   → Retry failed, trying fallback models...`);
          }
        } else {
          console.warn(`   → Error: ${error.response?.status || error.message}`);
        }
      }

      // Try fallback models
      for (let i = 1; i < this.models.length; i++) {
        const model = this.models[i];
        try {
          console.log(`   Trying fallback model: ${model}`);
          
          const response = await axios.post(
            `${this.baseUrl}/${model}`,
            {
              inputs: prompt,
              parameters: {
                image: `data:image/jpeg;base64,${base64Image}`,
              },
            },
            {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 60000,
            }
          );

          const result = this.parseLLaVAResponse(response.data);
          if (result) return result;
        } catch (error) {
          if (i === this.models.length - 1) {
            console.error(`❌ All LLaVA models failed`);
          }
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ LLaVA Error:', error.message);
      return null;
    }
  }

  /**
   * Parse LLaVA response and extract labels/features
   */
  parseLLaVAResponse(data) {
    try {
      let description = '';
      
      // Handle different response formats
      if (typeof data === 'string') {
        description = data;
      } else if (data?.generated_text) {
        description = data.generated_text;
      } else if (Array.isArray(data) && data.length > 0) {
        description = data[0]?.generated_text || data[0] || '';
      } else if (data?.text) {
        description = data.text;
      }

      if (!description || description.length === 0) {
        return null;
      }

      console.log('✅ LLaVA Analysis:');
      console.log(`   Description: ${description.substring(0, 150)}...`);

      // Extract labels from description
      const labels = this.extractLabelsFromDescription(description);
      
      // Extract colors
      const colors = this.extractColorsFromDescription(description);
      
      // Extract objects
      const objects = this.extractObjectsFromDescription(description);

      return {
        labels: labels,
        colors: colors,
        objects: objects,
        description: description,
        confidence: 0.9, // LLaVA is generally very confident
        source: 'llava',
        model: this.primaryModel,
      };
    } catch (error) {
      console.error('❌ Error parsing LLaVA response:', error);
      return null;
    }
  }

  /**
   * Extract labels from LLaVA description
   */
  extractLabelsFromDescription(description) {
    const labels = [];
    const lowerDesc = description.toLowerCase();
    
    // Common object keywords
    const objectKeywords = [
      'backpack', 'bag', 'purse', 'wallet', 'keys', 'keychain',
      'phone', 'mobile', 'smartphone', 'watch', 'glasses', 'sunglasses',
      'book', 'notebook', 'pen', 'pencil', 'laptop', 'tablet',
      'toy', 'doll', 'ball', 'bike', 'bicycle', 'helmet',
      'jacket', 'coat', 'shirt', 'hat', 'cap', 'scarf',
      'shoes', 'sneakers', 'boots', 'sandals',
      'umbrella', 'water bottle', 'bottle', 'cup', 'mug',
    ];

    for (const keyword of objectKeywords) {
      if (lowerDesc.includes(keyword)) {
        labels.push({
          description: keyword.charAt(0).toUpperCase() + keyword.slice(1),
          confidence: 0.8,
        });
      }
    }

    // If no specific objects found, use general terms from description
    if (labels.length === 0) {
      const words = description.split(/\s+/)
        .filter(w => w.length > 4)
        .slice(0, 5);
      
      words.forEach(word => {
        labels.push({
          description: word,
          confidence: 0.6,
        });
      });
    }

    return labels.slice(0, 10);
  }

  /**
   * Extract colors from description
   */
  extractColorsFromDescription(description) {
    const colors = [];
    const lowerDesc = description.toLowerCase();
    
    const colorKeywords = [
      'red', 'blue', 'green', 'yellow', 'black', 'white',
      'gray', 'grey', 'orange', 'purple', 'pink', 'brown',
    ];

    for (const color of colorKeywords) {
      if (lowerDesc.includes(color)) {
        colors.push({
          name: color,
          confidence: 0.7,
        });
      }
    }

    return colors;
  }

  /**
   * Extract objects from description
   */
  extractObjectsFromDescription(description) {
    const objects = [];
    const labels = this.extractLabelsFromDescription(description);
    
    labels.forEach(label => {
      objects.push({
        name: label.description,
        confidence: label.confidence,
      });
    });

    return objects.slice(0, 5);
  }

  /**
   * Extract features from image URL
   */
  async extractImageFeaturesFromUrl(imageUrl) {
    if (!this.apiKey) {
      return null;
    }

    try {
      console.log('🤖 Using LLaVA to analyze image from URL...');
      
      // Download image first
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const base64Image = Buffer.from(response.data).toString('base64');
      
      const prompt = "Describe this image in detail. List all objects, their colors, sizes, and any distinctive features.";
      
      const apiResponse = await axios.post(
        `${this.baseUrl}/${this.primaryModel}`,
        {
          inputs: {
            image: base64Image,
            prompt: prompt,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      return this.parseLLaVAResponse(apiResponse.data);
    } catch (error) {
      console.error('❌ LLaVA URL Error:', error.message);
      return null;
    }
  }
}

module.exports = new LLaVAService();

