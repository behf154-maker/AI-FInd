const { RekognitionClient, DetectLabelsCommand } = require('@aws-sdk/client-rekognition');
const fs = require('fs');
const sharp = require('sharp');

/**
 * Amazon Rekognition Service
 * High-quality image analysis (labels, colors, text detection)
 * 
 * Note: This is a PAID service - charges apply per image analyzed
 * Pricing: ~$1 per 1,000 images (first 1M images/month)
 */
class RekognitionService {
  constructor() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!accessKeyId || !secretAccessKey) {
      console.log('⚠️ Amazon Rekognition: Credentials not configured');
      this.enabled = false;
      return;
    }

    try {
      // Configure AWS SDK v3 Client
      this.rekognitionClient = new RekognitionClient({
        region: region,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      });

      this.enabled = true;
      console.log('✅ Amazon Rekognition enabled');
      console.log('   Region:', region);
      console.log('   ⚠️  This is a PAID service - charges apply per image');
    } catch (error) {
      console.error('❌ Amazon Rekognition setup error:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Analyze image and extract features
   * @param {string} imagePath - Local file path
   * @returns {Promise<Object>} Features object with labels, colors, etc.
   */
  async extractImageFeatures(imagePath) {
    if (!this.enabled) {
      throw new Error('Amazon Rekognition not enabled');
    }

    try {
      // Read image file
      const imageBytes = fs.readFileSync(imagePath);
      
      // Detect labels (objects, scenes, activities)
      const labelsParams = {
        Image: { Bytes: imageBytes },
        MaxLabels: 20,
        MinConfidence: 50, // Only return labels with >50% confidence
      };

      const command = new DetectLabelsCommand(labelsParams);
      const labelsResult = await this.rekognitionClient.send(command);

      // Extract dominant colors from image using image processing
      let dominantColors = [];
      try {
        dominantColors = await this._extractDominantColors(imagePath);
      } catch (colorError) {
        // Fallback: extract colors from label names
        if (labelsResult.Labels) {
          dominantColors = this._extractColorsFromLabels(labelsResult.Labels);
        }
      }

      // Process labels
      const labels = labelsResult.Labels
        .filter(label => label.Confidence >= 50)
        .map(label => ({
          description: label.Name.toLowerCase(),
          confidence: label.Confidence / 100, // Convert to 0-1 range
        }))
        .slice(0, 15); // Top 15 labels

      // Filter to relevant lost & found categories
      const relevantLabels = this._filterRelevantLabels(labels);

      console.log('✅ Amazon Rekognition Analysis:');
      console.log('   Labels:', relevantLabels.slice(0, 5).map(l => `${l.description} (${(l.confidence * 100).toFixed(1)}%)`).join(', '));
      console.log('   Colors:', dominantColors.length > 0 ? dominantColors.join(', ') : 'detected');

      return {
        labels: relevantLabels,
        colors: dominantColors,
        objects: relevantLabels.slice(0, 10),
        confidence: relevantLabels.length > 0 ? relevantLabels[0].confidence : 0.0,
        source: 'aws-rekognition',
        model: 'Amazon Rekognition',
      };
    } catch (error) {
      console.error('❌ Amazon Rekognition error:', error.message);
      if (error.code === 'InvalidSignatureException' || error.code === 'InvalidAccessKeyId') {
        console.error('   → Check your AWS credentials in .env file');
      } else if (error.code === 'ThrottlingException') {
        console.error('   → AWS rate limit exceeded, try again later');
      }
      throw error;
    }
  }

  /**
   * Analyze image from URL (downloads image first)
   * @param {string} imageUrl - Image URL (Cloudinary, etc.)
   * @returns {Promise<Object>} Features object
   */
  async extractImageFeaturesFromUrl(imageUrl) {
    if (!this.enabled) {
      throw new Error('Amazon Rekognition not enabled');
    }

    try {
      // Download image from URL
      const axios = require('axios');
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });
      const imageBytes = Buffer.from(response.data);

      // Detect labels
      const labelsParams = {
        Image: { Bytes: imageBytes },
        MaxLabels: 20,
        MinConfidence: 50,
      };

      const command = new DetectLabelsCommand(labelsParams);
      const labelsResult = await this.rekognitionClient.send(command);

      // Extract dominant colors from image
      let dominantColors = [];
      try {
        // Save downloaded image temporarily
        const tempPath = path.join(__dirname, '..', 'uploads', `temp_${Date.now()}.jpg`);
        fs.writeFileSync(tempPath, imageBytes);
        dominantColors = await this._extractDominantColors(tempPath);
        // Clean up temp file
        fs.unlinkSync(tempPath);
      } catch (colorError) {
        // Fallback: extract colors from label names
        if (labelsResult.Labels) {
          dominantColors = this._extractColorsFromLabels(labelsResult.Labels);
        }
      }

      // Process labels
      const labels = labelsResult.Labels
        .filter(label => label.Confidence >= 50)
        .map(label => ({
          description: label.Name.toLowerCase(),
          confidence: label.Confidence / 100,
        }))
        .slice(0, 15);

      const relevantLabels = this._filterRelevantLabels(labels);

      return {
        labels: relevantLabels,
        colors: dominantColors,
        objects: relevantLabels.slice(0, 10),
        confidence: relevantLabels.length > 0 ? relevantLabels[0].confidence : 0.0,
        source: 'aws-rekognition',
        model: 'Amazon Rekognition',
      };
    } catch (error) {
      console.error('❌ Amazon Rekognition URL error:', error.message);
      throw error;
    }
  }

  /**
   * Extract dominant colors from image using sharp (image processing)
   */
  async _extractDominantColors(imagePath) {
    try {
      const image = sharp(imagePath);
      const { dominant } = await image.stats();
      
      // Get top 3 dominant colors
      const colors = [];

      // Analyze dominant color channels
      if (dominant && dominant.rgb) {
        const r = dominant.rgb.r;
        const g = dominant.rgb.g;
        const b = dominant.rgb.b;

        // Simple color detection based on RGB values
        if (r > 200 && g < 100 && b < 100) colors.push('red');
        else if (r < 100 && g < 100 && b > 200) colors.push('blue');
        else if (r < 100 && g > 200 && b < 100) colors.push('green');
        else if (r > 200 && g > 200 && b < 100) colors.push('yellow');
        else if (r < 50 && g < 50 && b < 50) colors.push('black');
        else if (r > 200 && g > 200 && b > 200) colors.push('white');
        else if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r < 150) colors.push('gray');
        else if (r > 150 && g > 100 && b < 100) colors.push('orange');
        else if (r > 200 && g < 150 && b > 150) colors.push('pink');
        else if (r > 100 && g < 100 && b > 150) colors.push('purple');
        else if (r > 100 && g < 100 && b < 100) colors.push('brown');
      }

      return colors.length > 0 ? colors : ['multicolor'];
    } catch (error) {
      console.warn('⚠️ Color extraction failed:', error.message);
      return [];
    }
  }

  /**
   * Extract colors from Rekognition labels (fallback)
   */
  _extractColorsFromLabels(labels) {
    const colorKeywords = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'gray', 'grey', 'brown', 'orange', 'pink', 'purple'];
    const colors = [];

    for (const label of labels) {
      const name = label.Name.toLowerCase();
      for (const color of colorKeywords) {
        if (name.includes(color) && !colors.includes(color)) {
          colors.push(color);
        }
      }
    }

    return colors;
  }

  /**
   * Filter labels to relevant lost & found categories
   */
  _filterRelevantLabels(labels) {
    const relevantCategories = [
      // Clothing
      'shirt', 't-shirt', 'tshirt', 'clothing', 'apparel', 'jacket', 'coat', 'pants', 'jeans', 'shoes', 'sneakers', 'boots',
      'hat', 'cap', 'gloves', 'scarf', 'socks', 'underwear', 'dress', 'skirt', 'shorts',
      
      // Electronics
      'phone', 'smartphone', 'mobile', 'laptop', 'computer', 'tablet', 'watch', 'smartwatch', 'earphones', 'headphones',
      'charger', 'cable', 'battery', 'power bank',
      
      // Personal items
      'wallet', 'purse', 'bag', 'backpack', 'handbag', 'briefcase', 'suitcase', 'luggage',
      'key', 'keys', 'keychain', 'id card', 'card', 'credit card', 'license',
      'glasses', 'sunglasses', 'watch', 'jewelry', 'ring', 'necklace',
      
      // Stationery
      'pen', 'pencil', 'notebook', 'book', 'folder', 'binder', 'paper', 'document',
      
      // Other
      'bottle', 'water bottle', 'umbrella', 'toy', 'ball', 'tool',
    ];

    return labels.filter(label => {
      const desc = label.description.toLowerCase();
      return relevantCategories.some(cat => desc.includes(cat));
    });
  }
}

module.exports = new RekognitionService();

