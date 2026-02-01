const express = require('express');
const aiMatchingService = require('../services/aiMatchingService');

module.exports = (upload) => {
  const router = express.Router();

  // Test AI Vision API
  router.get('/test', async (req, res) => {
    try {
      const hasApiKey = !!process.env.GOOGLE_VISION_API_KEY;
      
      res.json({
        hasApiKey,
        apiKeyPreview: hasApiKey 
          ? `${process.env.GOOGLE_VISION_API_KEY.substring(0, 10)}...` 
          : 'Not set',
        status: hasApiKey ? 'Configured' : 'Not configured',
        message: hasApiKey 
          ? 'Google Vision API key is set. AI should work when images are uploaded.'
          : 'Please set GOOGLE_VISION_API_KEY in .env file',
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test image analysis (requires image file)
  router.post('/analyze', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const features = await aiMatchingService.extractImageFeatures(req.file.path);
      
      // Clean up
      const fs = require('fs');
      fs.unlink(req.file.path, () => {});

      res.json({
        success: true,
        features,
        message: features.note 
          ? 'AI analysis failed, using fallback' 
          : 'AI analysis successful',
      });
    } catch (error) {
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || 'Unknown error',
      });
    }
  });

  return router;
};

