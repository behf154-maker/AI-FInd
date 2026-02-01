const axios = require('axios');
const fs = require('fs');
const path = require('path');
const huggingFaceService = require('./huggingFaceService');
const pythonAIService = require('./pythonAIService');
const llavaService = require('./llavaService');
const rekognitionService = require('./rekognitionService');

class AIMatchingService {
  constructor() {
    this.googleVisionApiKey = process.env.GOOGLE_VISION_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.useHuggingFace = process.env.USE_HUGGINGFACE === 'true' || !this.googleVisionApiKey;
    // Disable Python AI by default if PyTorch has DLL issues
    // Set USE_PYTHON_AI=true explicitly to enable after fixing PyTorch
    this.usePythonAI = process.env.USE_PYTHON_AI === 'true';
    // LLaVA - best quality AI for image analysis
    this.useLLaVA = process.env.USE_LLAVA === 'true';
    
    if (this.usePythonAI) {
      console.log('⚠️ Python AI enabled - make sure PyTorch is working correctly');
    }
    
    if (this.useLLaVA) {
      console.log('✅ LLaVA enabled - using advanced vision-language model');
    }
  }

  /**
   * Extract features from an image using Google Vision API
   * Features: item type, color, pattern, etc.
   */
  async extractImageFeatures(imagePath) {
    // Try Amazon Rekognition first (best quality, paid but very accurate)
    if (rekognitionService.enabled) {
      try {
        console.log('🤖 Using Amazon Rekognition to analyze image...');
        const features = await rekognitionService.extractImageFeatures(imagePath);
        if (features && features.labels?.length > 0) {
          return features;
        }
      } catch (rekError) {
        console.warn('⚠️ Amazon Rekognition failed, trying LLaVA...');
      }
    }

    // Try LLaVA (best quality, detailed analysis)
    if (this.useLLaVA) {
      try {
        const features = await llavaService.extractImageFeatures(imagePath);
        if (features && features.labels?.length > 0) {
          return features;
        }
      } catch (llavaError) {
        console.warn('⚠️ LLaVA failed, trying Python AI...');
      }
    }

    // Try Python AI Service (Local, FREE, no limits)
    if (this.usePythonAI) {
      try {
        const features = await pythonAIService.extractImageFeatures(imagePath);
        if (features && features.labels?.length > 0) {
          return features;
        }
      } catch (pyError) {
        console.warn('⚠️ Python AI service failed, trying HuggingFace...');
      }
    }

    // Try HuggingFace API/Mirror (FREE, no billing)
    if (this.useHuggingFace) {
      try {
        const features = await huggingFaceService.extractImageFeatures(imagePath);
        if (features.labels?.length > 0) {
          return features;
        }
      } catch (hfError) {
        console.warn('⚠️ HuggingFace failed, trying Google Vision...');
      }
    }

    // Try Google Vision API (if configured and billing enabled)
    if (this.googleVisionApiKey) {
      try {
        console.log('🔍 Extracting AI features using Google Vision:', imagePath);
        const imageData = fs.readFileSync(imagePath);
        const base64Image = imageData.toString('base64');

        const response = await axios.post(
          `https://vision.googleapis.com/v1/images:annotate?key=${this.googleVisionApiKey}`,
          {
            requests: [
              {
                image: {
                  content: base64Image,
                },
                features: [
                  { type: 'LABEL_DETECTION', maxResults: 10 },
                  { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
                  { type: 'IMAGE_PROPERTIES' },
                ],
              },
            ],
          }
        );

        const features = this.parseGoogleVisionResponse(response.data);
        console.log('✅ Google Vision AI Results:');
        console.log('   Labels:', features.labels.map(l => `${l.description} (${(l.confidence * 100).toFixed(1)}%)`).join(', '));
        console.log('   Colors:', features.colors.length, 'dominant colors detected');
        console.log('   Objects:', features.objects.map(o => o.name).join(', ') || 'None');
        
        return features;
      } catch (error) {
        if (error.response?.status === 403) {
          console.error('❌ Google Vision: Billing not enabled');
          console.log('🔄 Switching to HuggingFace (FREE)...');
          // Try HuggingFace as fallback
          try {
            return await huggingFaceService.extractImageFeatures(imagePath);
          } catch (hfError) {
            console.warn('⚠️ HuggingFace also failed, using metadata matching');
          }
        } else {
          console.error('❌ Google Vision Error:', error.message);
        }
      }
    }

    // Final fallback
    console.log('📊 Using metadata-based matching (no AI available)');
    return this.extractFeaturesFromFile(imagePath);
  }

  /**
   * Extract features from image URL (for Cloudinary images)
   */
  async extractImageFeaturesFromUrl(imageUrl) {
    // Try Amazon Rekognition first (best quality, paid but very accurate)
    if (rekognitionService.enabled) {
      try {
        console.log('🤖 Using Amazon Rekognition to analyze image from URL...');
        const features = await rekognitionService.extractImageFeaturesFromUrl(imageUrl);
        if (features && features.labels?.length > 0) {
          return features;
        }
      } catch (rekError) {
        console.warn('⚠️ Amazon Rekognition URL failed, trying LLaVA...');
      }
    }

    // Try LLaVA (best quality)
    if (this.useLLaVA) {
      try {
        const features = await llavaService.extractImageFeaturesFromUrl(imageUrl);
        if (features && features.labels?.length > 0) {
          return features;
        }
      } catch (llavaError) {
        console.warn('⚠️ LLaVA failed, trying Python AI...');
      }
    }

    // Try Python AI Service (Local, FREE)
    if (this.usePythonAI) {
      try {
        const features = await pythonAIService.extractImageFeaturesFromUrl(imageUrl);
        if (features && features.labels?.length > 0) {
          return features;
        }
      } catch (pyError) {
        console.warn('⚠️ Python AI service failed, trying HuggingFace...');
      }
    }

    // Try HuggingFace API/Mirror (FREE)
    if (this.useHuggingFace) {
      try {
        const features = await huggingFaceService.extractImageFeaturesFromUrl(imageUrl);
        if (features.labels?.length > 0) {
          return features;
        }
      } catch (hfError) {
        console.warn('⚠️ HuggingFace URL failed, trying Google Vision...');
      }
    }

    // Try Google Vision API
    if (this.googleVisionApiKey) {
      try {
        console.log('🔍 Extracting AI features from URL using Google Vision:', imageUrl);
        
        const response = await axios.post(
          `https://vision.googleapis.com/v1/images:annotate?key=${this.googleVisionApiKey}`,
          {
            requests: [
              {
                image: {
                  source: {
                    imageUri: imageUrl,
                  },
                },
                features: [
                  { type: 'LABEL_DETECTION', maxResults: 10 },
                  { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
                  { type: 'IMAGE_PROPERTIES' },
                ],
              },
            ],
          }
        );

        const features = this.parseGoogleVisionResponse(response.data);
        console.log('✅ Google Vision Results from URL:');
        console.log('   Labels:', features.labels.map(l => `${l.description} (${(l.confidence * 100).toFixed(1)}%)`).join(', '));
        
        return features;
      } catch (error) {
        if (error.response?.status === 403) {
          // Try HuggingFace as fallback
          try {
            return await huggingFaceService.extractImageFeaturesFromUrl(imageUrl);
          } catch (hfError) {
            // Ignore
          }
        }
        console.error('❌ Error extracting features from URL:', error.message);
      }
    }

    // Final fallback
    return this.extractFeaturesFromFile(null);
  }

  /**
   * Parse Google Vision API response
   */
  parseGoogleVisionResponse(data) {
    const response = data.responses[0];
    const features = {
      labels: [],
      colors: [],
      objects: [],
      confidence: 0,
    };

    // Extract labels (item types)
    if (response.labelAnnotations) {
      features.labels = response.labelAnnotations.map((label) => ({
        description: label.description,
        confidence: label.confidence,
      }));
    }

    // Extract colors
    if (response.imagePropertiesAnnotation) {
      const dominantColors = response.imagePropertiesAnnotation.dominantColors;
      if (dominantColors && dominantColors.colors) {
        features.colors = dominantColors.colors.map((color) => ({
          red: color.color.red || 0,
          green: color.color.green || 0,
          blue: color.color.blue || 0,
          pixelFraction: color.pixelFraction,
        }));
      }
    }

    // Extract objects
    if (response.localizedObjectAnnotations) {
      features.objects = response.localizedObjectAnnotations.map((obj) => ({
        name: obj.name,
        confidence: obj.score,
      }));
    }

    return features;
  }

  /**
   * Fallback method to extract features from file metadata
   */
  extractFeaturesFromFile(imagePath) {
    return {
      labels: [],
      colors: [],
      objects: [],
      confidence: 0,
      note: 'Fallback extraction - limited features',
    };
  }

  /**
   * Calculate similarity score between two sets of features
   */
  calculateSimilarityScore(features1, features2) {
    // Handle null/undefined cases
    if (!features1 || !features2) {
      return 0;
    }
    
    // Ensure features are objects
    if (typeof features1 !== 'object' || typeof features2 !== 'object') {
      return 0;
    }
    
    let score = 0;
    let weights = {
      labels: 0.4,
      colors: 0.3,
      objects: 0.3,
    };

    // Compare labels
    if (features1.labels && features2.labels) {
      const labels1 = features1.labels
        .map((l) => (l && typeof l === 'object' && l.description) ? l.description : String(l || ''))
        .filter(l => l && l.length > 0);
      const labels2 = features2.labels
        .map((l) => (l && typeof l === 'object' && l.description) ? l.description : String(l || ''))
        .filter(l => l && l.length > 0);
      
      if (labels1.length > 0 && labels2.length > 0) {
        const labelSimilarity = this.compareLists(labels1, labels2);
      score += labelSimilarity * weights.labels;
      }
    }

    // Compare colors
    if (features1.colors && features2.colors) {
      const colorSimilarity = this.compareColors(features1.colors, features2.colors);
      score += colorSimilarity * weights.colors;
    }

    // Compare objects
    if (features1.objects && features2.objects) {
      const objects1 = features1.objects
        .map((o) => (o && typeof o === 'object' && o.name) ? o.name : String(o || ''))
        .filter(o => o && o.length > 0);
      const objects2 = features2.objects
        .map((o) => (o && typeof o === 'object' && o.name) ? o.name : String(o || ''))
        .filter(o => o && o.length > 0);
      
      if (objects1.length > 0 && objects2.length > 0) {
        const objectSimilarity = this.compareLists(objects1, objects2);
      score += objectSimilarity * weights.objects;
      }
    }

    return Math.min(score * 100, 100);
  }

  /**
   * Compare two lists of items
   */
  compareLists(list1, list2) {
    // Handle null/undefined cases
    if (!list1 || !list2 || !Array.isArray(list1) || !Array.isArray(list2)) {
      return 0;
    }
    
    if (list1.length === 0 || list2.length === 0) return 0;

    let matches = 0;
    for (let item1 of list1) {
      for (let item2 of list2) {
        if (this.stringSimilarity(item1, item2) > 0.7) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(list1.length, list2.length);
  }

  /**
   * Compare two color sets
   */
  compareColors(colors1, colors2) {
    // Handle null/undefined cases
    if (!colors1 || !colors2 || !Array.isArray(colors1) || !Array.isArray(colors2)) {
      return 0;
    }
    
    if (colors1.length === 0 || colors2.length === 0) return 0;

    const dominantColor1 = colors1[0];
    const dominantColor2 = colors2[0];

    // Handle string colors (like "red", "blue") - return 0 similarity for now
    if (typeof dominantColor1 === 'string' || typeof dominantColor2 === 'string') {
      // Simple string comparison
      if (dominantColor1 === dominantColor2) return 1.0;
      return 0;
    }

    // Handle object colors with RGB values
    if (typeof dominantColor1 === 'object' && typeof dominantColor2 === 'object') {
      const red1 = dominantColor1.red || 0;
      const green1 = dominantColor1.green || 0;
      const blue1 = dominantColor1.blue || 0;
      
      const red2 = dominantColor2.red || 0;
      const green2 = dominantColor2.green || 0;
      const blue2 = dominantColor2.blue || 0;

    const distance = Math.sqrt(
        Math.pow(red1 - red2, 2) +
        Math.pow(green1 - green2, 2) +
        Math.pow(blue1 - blue2, 2)
    );

    // Normalize distance (max distance is ~441)
    return Math.max(0, 1 - distance / 441);
    }

    return 0;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  stringSimilarity(str1, str2) {
    // Handle null/undefined cases
    if (!str1 || !str2) return 0;
    if (typeof str1 !== 'string') str1 = String(str1);
    if (typeof str2 !== 'string') str2 = String(str2);
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Match a lost item with found items
   */
  async matchItems(lostItemFeatures, foundItemsFeatures) {
    const matches = foundItemsFeatures.map((foundFeatures, index) => ({
      itemIndex: index,
      score: this.calculateSimilarityScore(lostItemFeatures, foundFeatures),
    }));

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    // Return top matches (score > 50%)
    return matches.filter((match) => match.score >= 50);
  }
}

module.exports = new AIMatchingService();
