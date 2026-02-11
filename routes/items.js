const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const imageStorage = require('../services/imageStorage');
const aiMatchingService = require('../services/aiMatchingService');
const matchingService = require('../services/matchingService');
const { mapLabelToCategory } = require('../utils/categoryMapper');

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Smart metadata-based matching when AI is unavailable
function calculateMetadataMatchScore(item, searchImageFeatures, searchTerms) {
  let score = 0;
  const itemType = (item.item_type || '').toLowerCase().trim();
  const itemColor = (item.color || '').toLowerCase().trim();
  const itemDescription = (item.description || '').toLowerCase().trim();
  const itemSize = (item.size || '').toLowerCase().trim();
  
  // Extract search terms from text and AI labels
  let allSearchTerms = (searchTerms || '').toLowerCase().trim();
  if (searchImageFeatures?.labels?.length > 0) {
    const aiLabels = searchImageFeatures.labels
      .map(l => l.description.toLowerCase().trim())
      .filter(l => l.length > 0)
      .join(' ');
    allSearchTerms = `${allSearchTerms} ${aiLabels}`.trim();
  }
  
  if (!allSearchTerms || allSearchTerms.length === 0) {
    // No search terms - return base score
    return {
      ...item,
      match_score: 0,
    };
  }
  
  // Split search terms into words (including multi-word terms)
  const searchWords = allSearchTerms
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => w.trim());
  
  // Also check for exact phrase match
  const exactPhrase = allSearchTerms.trim();
  
  // Item type matching (highest weight - 60 points)
  if (itemType && itemType.length > 0) {
    // Exact match (highest score)
    if (itemType === exactPhrase || searchWords.includes(itemType)) {
      score += 60;
    } else {
      // Partial match with similarity
      let bestMatch = 0;
      for (const word of searchWords) {
        if (itemType.includes(word) || word.includes(itemType)) {
          bestMatch = Math.max(bestMatch, 40);
        }
        const similarity = aiMatchingService.stringSimilarity(itemType, word);
        if (similarity > 0.7) {
          bestMatch = Math.max(bestMatch, 50);
        } else if (similarity > 0.5) {
          bestMatch = Math.max(bestMatch, 30);
        }
      }
      score += bestMatch;
    }
  }
  
  // Color matching (25 points)
  if (itemColor && itemColor.length > 0) {
    // Common color variations
    const colorMap = {
      'red': ['red', 'rouge', 'أحمر'],
      'blue': ['blue', 'bleu', 'أزرق'],
      'green': ['green', 'vert', 'أخضر'],
      'yellow': ['yellow', 'jaune', 'أصفر'],
      'black': ['black', 'noir', 'أسود'],
      'white': ['white', 'blanc', 'أبيض'],
      'gray': ['gray', 'grey', 'gris', 'رمادي'],
      'orange': ['orange', 'برتقالي'],
      'purple': ['purple', 'violet', 'بنفسجي'],
    };
    
    let colorMatch = false;
    const normalizedColor = itemColor.toLowerCase();
    
    // Direct match
    if (searchWords.some(word => normalizedColor.includes(word) || word.includes(normalizedColor))) {
      colorMatch = true;
      score += 25;
    } else {
      // Check color variations
      for (const [key, variations] of Object.entries(colorMap)) {
        if (normalizedColor === key || variations.includes(normalizedColor)) {
          if (searchWords.some(word => variations.includes(word) || word === key)) {
            colorMatch = true;
            score += 20;
            break;
          }
        }
      }
    }
  }
  
  // Description matching (20 points for exact, 15 for partial, 10 for word match)
  if (itemDescription && itemDescription.length > 0) {
    // Exact phrase match
    if (itemDescription.includes(exactPhrase)) {
      score += 20;
    } else {
      // Count matching words
      let matchingWords = 0;
      for (const word of searchWords) {
        if (itemDescription.includes(word)) {
          matchingWords++;
        }
      }
      
      if (matchingWords > 0) {
        const matchRatio = matchingWords / searchWords.length;
        if (matchRatio >= 0.7) {
          score += 15; // Most words match
        } else if (matchRatio >= 0.4) {
          score += 10; // Some words match
        } else {
          score += 5; // Few words match
        }
      }
    }
  }
  
  // Size matching (10 points)
  if (itemSize && itemSize.length > 0) {
    const sizeMatch = searchWords.some(word => {
      const normalizedSize = itemSize.toLowerCase();
      return normalizedSize.includes(word) || word.includes(normalizedSize) ||
             (word === 'small' && normalizedSize === 'small') ||
             (word === 'medium' && normalizedSize === 'medium') ||
             (word === 'large' && normalizedSize === 'large');
    });
    if (sizeMatch) {
      score += 10;
    }
  }
  
  // Bonus: Multiple criteria match (10 points)
  let criteriaMatched = 0;
  if (itemType && searchWords.some(w => itemType.includes(w) || w.includes(itemType))) criteriaMatched++;
  if (itemColor && searchWords.some(w => itemColor.includes(w) || w.includes(itemColor))) criteriaMatched++;
  if (itemDescription && searchWords.some(w => itemDescription.includes(w))) criteriaMatched++;
  if (itemSize && searchWords.some(w => itemSize.includes(w))) criteriaMatched++;
  
  if (criteriaMatched >= 3) {
    score += 15; // Bonus for matching multiple criteria
  } else if (criteriaMatched >= 2) {
    score += 8;
  }
  
  // Ensure minimum score for any match
  if (score > 0 && score < 10) {
    score = 10; // Minimum visible score
  }
  
  return {
    ...item,
    match_score: Math.min(Math.round(score), 100),
  };
}

module.exports = (pool, upload) => {
  const router = express.Router();

  // Report item (lost or found)
  router.post('/report', verifyToken, upload.single('image'), async (req, res) => {
    try {
      const { itemType, color, size, location, status, category, subcategory, material, mark, subject, grade } = req.body;
      let { description } = req.body || '';
      const userId = req.userId;

      let finalCategory = category;
      let finalSubcategory = subcategory;
      let aiFeatures = null;
      let imagePath = null;

      // Analyze image with Amazon Rekognition if available (BEFORE uploadImage which may delete the file)
      if (req.file && req.file.path) {
        // Check if file exists
        if (!fs.existsSync(req.file.path)) {
          console.warn('⚠️ Uploaded file does not exist:', req.file.path);
        } else {
          try {
            console.log('📸 Analyzing uploaded image with Amazon Rekognition...');
            aiFeatures = await aiMatchingService.extractImageFeatures(req.file.path);
          
          if (aiFeatures && aiFeatures.labels && aiFeatures.labels.length > 0) {
            // Extract top relevant labels
            const topLabels = aiFeatures.labels
              .slice(0, 5)
              .map(label => label.description)
              .join(', ');
            
            // Build AI description
            let aiDescription = `\n\nAI detected: ${topLabels}`;
            
            // Add colors if detected
            if (aiFeatures.colors && aiFeatures.colors.length > 0) {
              aiDescription += ` (colors: ${aiFeatures.colors.join(', ')})`;
            }
            
            // Append AI description to user description
            description = (description || '').trim();
            if (description) {
              description += aiDescription;
            } else {
              description = aiDescription.trim();
            }
            
            console.log('✅ AI analysis added to description');
            console.log('   Labels:', topLabels);
            if (aiFeatures.colors && aiFeatures.colors.length > 0) {
              console.log('   Colors:', aiFeatures.colors.join(', '));
            }

            // Auto-detect category from AI labels if not provided
            if (!finalCategory && aiFeatures.labels.length > 0) {
              const topLabel = aiFeatures.labels[0].description;
              const categoryMap = mapLabelToCategory(topLabel);
              finalCategory = categoryMap.category;
              finalSubcategory = categoryMap.subcategory;
              console.log('   Auto-detected category:', finalCategory, '/', finalSubcategory);
            }
          }
          } catch (aiError) {
            console.warn('⚠️ AI analysis failed, saving without AI description:', aiError.message);
            // Continue without AI description if analysis fails
          }
        }
      }

      // Upload image AFTER analysis (so the file is still available for AI processing)
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        imagePath = await imageStorage.uploadImage(req.file.path);
      }

      const connection = await pool.getConnection();

      // Build description with mark, subject, grade if provided
      let finalDescription = description;
      if (mark && mark.trim()) {
        finalDescription = (finalDescription ? finalDescription + '\n' : '') + `Mark: ${mark}`;
      }
      if (subject && subject.trim()) {
        finalDescription = (finalDescription ? finalDescription + '\n' : '') + `Subject: ${subject}`;
        if (grade && grade.trim()) {
          finalDescription += `, Grade: ${grade}`;
        }
      }

      // Insert the item
      const [result] = await connection.execute(
        `INSERT INTO items (user_id, item_type, category, subcategory, color, size, material, mark, subject, grade, location_found, description, image_path, status, date_reported)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [userId, itemType, finalCategory || null, finalSubcategory || null, color, size, material || null, mark || null, subject || null, grade || null, location, finalDescription || null, imagePath, status]
      );

      const newItemId = result.insertId;

      // If this is a lost item, try to match it with found items
      if (status === 'lost' && newItemId) {
        try {
          console.log('🔍 Searching for matches for lost item...');
          
          // Search for found items with similar characteristics
          let searchQuery = `SELECT * FROM items WHERE status = 'found'`;
          const searchParams = [];
          
          if (finalCategory) {
            searchQuery += ` AND (category = ? OR category IS NULL)`;
            searchParams.push(finalCategory);
          }
          
          if (finalSubcategory) {
            searchQuery += ` AND (subcategory = ? OR subcategory IS NULL)`;
            searchParams.push(finalSubcategory);
          }
          
          if (color) {
            searchQuery += ` AND (color LIKE ? OR color IS NULL)`;
            searchParams.push(`%${color}%`);
          }
          
          searchQuery += ` LIMIT 20`;
          
          const [foundItems] = await connection.execute(searchQuery, searchParams);
          
          if (foundItems.length > 0 && aiFeatures && aiFeatures.labels?.length > 0) {
            // Use AI matching if available
            const matches = await Promise.all(
              foundItems.map(async (foundItem) => {
                try {
                  let foundFeatures = null;
                  if (foundItem.image_path && foundItem.image_path.startsWith('http')) {
                    foundFeatures = await aiMatchingService.extractImageFeaturesFromUrl(foundItem.image_path);
                  } else if (foundItem.image_path) {
                    const fullPath = path.join(__dirname, '..', foundItem.image_path);
                    if (fs.existsSync(fullPath)) {
                      foundFeatures = await aiMatchingService.extractImageFeatures(fullPath);
                    }
                  }
                  
                  if (foundFeatures && foundFeatures.labels?.length > 0) {
                    const score = aiMatchingService.calculateSimilarityScore(aiFeatures, foundFeatures);
                    return { item: foundItem, score: Math.round(score) };
                  }
                } catch (e) {
                  // Ignore errors for individual items
                }
                return null;
              })
            );
            
            // Filter and sort matches by score
            const validMatches = matches
              .filter(m => m && m.score >= 50) // Only matches with 50%+ similarity
              .sort((a, b) => b.score - a.score)
              .slice(0, 5); // Top 5 matches
            
            // Create match records
            for (const match of validMatches) {
              await connection.execute(
                `INSERT INTO matches (lost_item_id, found_item_id, match_score, status)
                 VALUES (?, ?, ?, 'pending')
                 ON DUPLICATE KEY UPDATE match_score = ?`,
                [newItemId, match.item.item_id, match.score, match.score]
              );
              
              // Create notification for the user who found the item
              await connection.execute(
                `INSERT INTO notifications (user_id, item_id, message, is_read)
                 VALUES (?, ?, ?, FALSE)`,
                [
                  match.item.user_id,
                  match.item.item_id,
                  `Potential match found (${match.score}% similarity) for a lost item that matches the item you reported.`
                ]
              );
            }
            
            if (validMatches.length > 0) {
              console.log(`✅ Found ${validMatches.length} potential matches`);
            }
          } else if (foundItems.length > 0) {
            // Use metadata matching if AI is not available
            const matches = foundItems
              .map(item => calculateMetadataMatchScore(item, aiFeatures, `${itemType} ${color} ${description}`))
              .filter(item => item.match_score >= 40)
              .sort((a, b) => b.match_score - a.match_score)
              .slice(0, 5);
            
            for (const match of matches) {
              await connection.execute(
                `INSERT INTO matches (lost_item_id, found_item_id, match_score, status)
                 VALUES (?, ?, ?, 'pending')
                 ON DUPLICATE KEY UPDATE match_score = ?`,
                [newItemId, match.item_id, match.match_score, match.match_score]
              );
              
              await connection.execute(
                `INSERT INTO notifications (user_id, item_id, message, is_read)
                 VALUES (?, ?, ?, FALSE)`,
                [
                  match.user_id,
                  match.item_id,
                  `Potential match found (${match.match_score}% similarity) for a lost item.`
                ]
              );
            }
          }
        } catch (matchingError) {
          console.error('⚠️ Error in automatic matching:', matchingError);
          // Continue even if matching fails
        }
      }

      connection.release();

      res.status(201).json({ message: 'Item reported successfully', itemId: newItemId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to report item' });
    }
  });

  // Search items
  router.post('/search', verifyToken, upload.single('image'), async (req, res) => {
    try {
      const { query = '', description = '' } = req.body;
      const connection = await pool.getConnection();

      let results = [];
      let aiInsights = null;
      let searchTerms = `${query} ${description}`.trim();
      let searchImageFeatures = null;

      if (req.file) {
        console.log('📸 Image uploaded for search, starting AI analysis...');
        try {
          const features = await aiMatchingService.extractImageFeatures(req.file.path);
          aiInsights = features;
          searchImageFeatures = features;
          
          if (features.labels?.length > 0) {
            const topLabels = features.labels
              .slice(0, 3)
              .map((label) => label.description)
              .join(' ');
            searchTerms = `${searchTerms} ${topLabels}`.trim();
            console.log('🔑 AI-extracted search terms:', topLabels);
            console.log('✅ AI source:', features.source || 'unknown');
          } else {
            console.warn('⚠️ No labels extracted from image');
            if (features.note) {
              console.log('   →', features.note);
            }
          }
        } catch (visionError) {
          console.error('❌ AI extraction error:', visionError.message);
          // Continue with keyword search even if AI fails
        } finally {
          fs.unlink(req.file.path, () => {});
        }
      }

      if (searchTerms) {
        // 🔎 Smarter SQL search:
        // بدلاً من البحث عن السلسلة كاملة "%word1 word2 word3%",
        // نقسم الكلمات ونبحث بـ OR على كل كلمة لوحدها
        const searchWords = searchTerms
          .toLowerCase()
          .split(/[^a-z0-9]+/i)
          .map(w => w.trim())
          .filter(w => w.length >= 2); // تجاهل الكلمات القصيرة جدًا

        if (searchWords.length > 0) {
          let whereClauses = [];
          let params = [];

          for (const word of searchWords) {
            const like = `%${word}%`;
            whereClauses.push('(item_type LIKE ? OR color LIKE ? OR description LIKE ?)');
            params.push(like, like, like);
          }

          const whereSql = whereClauses.join(' OR ');
          const sql = `SELECT * FROM items WHERE status = 'found' AND (${whereSql}) LIMIT 50`;
          const [rows] = await connection.execute(sql, params);
          results = rows;

          // إذا مفيش أي عناصر رجعت، نجرب نجيب كل العناصر found كـ fallback
          if (!results || results.length === 0) {
            console.log('ℹ️ No items matched SQL keywords directly, falling back to all found items for smart scoring');
            const [fallbackRows] = await connection.execute(
              `SELECT * FROM items WHERE status = 'found' LIMIT 50`
            );
            results = fallbackRows;
          }
        } else {
          const [rows] = await connection.execute(
            `SELECT * FROM items WHERE status = 'found' LIMIT 20`
          );
          results = rows;
        }
      } else {
        const [rows] = await connection.execute(
          `SELECT * FROM items WHERE status = 'found' LIMIT 20`
        );
        results = rows;
      }

      // Calculate match scores - use AI if available, otherwise use smart metadata matching
      const hasValidAIFeatures = searchImageFeatures && 
        searchImageFeatures.labels?.length > 0 && 
        !searchImageFeatures.note; // No fallback note means AI worked
      
      if (hasValidAIFeatures && results.length > 0) {
        // AI is working - use full AI matching
        try {
          console.log('🤖 Starting AI-powered matching for', results.length, 'items');
          
          // Extract features from all found item images using AI
          const foundItemsFeatures = await Promise.all(
            results.map(async (item, index) => {
              if (item.image_path && item.image_path.startsWith('http')) {
                try {
                  const features = await aiMatchingService.extractImageFeaturesFromUrl(item.image_path);
                  return features;
                } catch (err) {
                  return null;
                }
              } else if (item.image_path) {
                try {
                  const fullPath = path.join(__dirname, '..', item.image_path);
                  if (fs.existsSync(fullPath)) {
                    const features = await aiMatchingService.extractImageFeatures(fullPath);
                    return features;
                  }
                } catch (err) {
                  // Ignore
                }
              }
              return null;
            })
          );

          // Calculate similarity scores using AI matching
          results = await Promise.all(
            results.map(async (item, index) => {
              const foundFeatures = foundItemsFeatures[index];
              
              if (foundFeatures && foundFeatures.labels?.length > 0) {
                // Use AI similarity calculation
                const aiScore = aiMatchingService.calculateSimilarityScore(
                  searchImageFeatures,
                  foundFeatures
                );
                
                const finalScore = Math.min(aiScore, 100);
                console.log(`   Item ${index + 1} (${item.item_type}): AI Score=${finalScore.toFixed(1)}%`);
                
                return {
                  ...item,
                  match_score: Math.round(finalScore),
                };
              } else {
                // Fallback to metadata matching for this item
                return calculateMetadataMatchScore(item, searchImageFeatures, searchTerms);
              }
            })
          );

          // Sort by match score descending
          results.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
          console.log('✅ AI matching complete. Top match:', results[0]?.match_score || 0, '%');
        } catch (matchingError) {
          console.error('❌ Error in AI matching:', matchingError);
          // Fallback to metadata matching
          results = results.map((item) => calculateMetadataMatchScore(item, searchImageFeatures, searchTerms));
        }
      } else if (searchTerms || req.file) {
        // No AI or AI failed - use enhanced smart metadata matching
        console.log('📊 Using enhanced smart metadata matching (AI unavailable)');
        console.log('   Search terms:', searchTerms || 'none');
        console.log('   Analyzing', results.length, 'items...');
        
        results = results.map((item) => calculateMetadataMatchScore(item, searchImageFeatures, searchTerms));
        
        // Sort by match score descending
        results.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
        
        // Log top matches
        const topMatches = results.filter(r => r.match_score > 0).slice(0, 5);
        if (topMatches.length > 0) {
          console.log('✅ Enhanced matching complete. Top matches:');
          topMatches.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.item_type} (${item.color}) - ${item.match_score}%`);
          });
        } else {
          console.log('⚠️  No matches found. Try different search terms.');
        }
      } else {
        // No search criteria - no match scores
        results = results.map((item) => ({
          ...item,
          match_score: 0,
        }));
      }

      connection.release();

      res.json({ results, aiInsights });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // Get my items
  router.get('/my-items', verifyToken, async (req, res) => {
    try {
      const userId = req.userId;
      const connection = await pool.getConnection();

      const [rows] = await connection.execute(
        'SELECT * FROM items WHERE user_id = ? ORDER BY date_reported DESC',
        [userId]
      );

      connection.release();

      res.json({ items: rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  // Get found items
  router.get('/found', verifyToken, async (req, res) => {
    try {
      const connection = await pool.getConnection();

      const [rows] = await connection.execute(
        'SELECT * FROM items WHERE status = "found" ORDER BY date_found DESC LIMIT 50'
      );

      connection.release();

      res.json({ items: rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch found items' });
    }
  });

  // Update item status
  router.put('/:itemId/status', verifyToken, async (req, res) => {
    try {
      const { itemId } = req.params;
      const { status } = req.body;
      const userId = req.userId;

      const connection = await pool.getConnection();

      // Verify ownership
      const [item] = await connection.execute(
        'SELECT * FROM items WHERE item_id = ? AND user_id = ?',
        [itemId, userId]
      );

      if (item.length === 0) {
        connection.release();
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await connection.execute(
        'UPDATE items SET status = ? WHERE item_id = ?',
        [status, itemId]
      );

      connection.release();

      res.json({ message: 'Item status updated' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update item' });
    }
  });

  // Delete item
  router.delete('/:itemId', verifyToken, async (req, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.userId;

      const connection = await pool.getConnection();

      // Verify ownership
      const [item] = await connection.execute(
        'SELECT * FROM items WHERE item_id = ? AND user_id = ?',
        [itemId, userId]
      );

      if (item.length === 0) {
        connection.release();
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await connection.execute('DELETE FROM items WHERE item_id = ?', [itemId]);

      connection.release();

      res.json({ message: 'Item deleted' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete item' });
    }
  });

  // Get matches for lost items
  router.get('/matches', verifyToken, async (req, res) => {
    try {
      const userId = req.userId;
      const { lostItemId } = req.query;
      const connection = await pool.getConnection();

      let query = `
        SELECT 
          m.match_id,
          m.lost_item_id,
          m.found_item_id,
          m.match_score,
          m.status,
          m.created_at,
          i.item_id as found_item_id,
          i.item_type,
          i.category,
          i.subcategory,
          i.color,
          i.size,
          i.location_found,
          i.description,
          i.image_path,
          i.status as item_status,
          i.date_reported
        FROM matches m
        INNER JOIN items i ON m.found_item_id = i.item_id
        INNER JOIN items lost ON m.lost_item_id = lost.item_id
        WHERE lost.user_id = ?
      `;
      
      const params = [userId];
      
      if (lostItemId) {
        query += ' AND m.lost_item_id = ?';
        params.push(lostItemId);
      }
      
      query += ' ORDER BY m.match_score DESC, m.created_at DESC';

      const [matches] = await connection.execute(query, params);

      // Format matches
      const formattedMatches = matches.map(match => ({
        match_id: match.match_id,
        lost_item_id: match.lost_item_id,
        found_item_id: match.found_item_id,
        match_score: match.match_score,
        status: match.status,
        created_at: match.created_at,
        found_item: {
          item_id: match.found_item_id,
          item_type: match.item_type,
          category: match.category,
          subcategory: match.subcategory,
          color: match.color,
          size: match.size,
          location_found: match.location_found,
          description: match.description,
          image_path: match.image_path,
          status: match.item_status,
          date_reported: match.date_reported,
        },
      }));

      connection.release();

      res.json({ matches: formattedMatches });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch matches' });
    }
  });

  // Get notifications
  router.get('/notifications', verifyToken, async (req, res) => {
    try {
      const userId = req.userId;
      const connection = await pool.getConnection();
      
      const [rows] = await connection.execute(
        `SELECT 
          n.notification_id,
          n.user_id,
          n.item_id,
          n.message,
          n.is_read,
          n.created_at,
          n.read_at,
          n.student_id,
          n.student_name,
          n.student_email,
          n.student_phone,
          n.student_class,
          n.student_school,
          n.student_grade,
          n.notification_type,
          n.created_by_admin,
          i.item_type,
          i.image_path,
          i.color,
          i.status as item_status
         FROM notifications n
         LEFT JOIN items i ON n.item_id = i.item_id
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC
         LIMIT 50`,
        [userId]
      );
      
      connection.release();

      const notifications = rows.map((row) => ({
        notification_id: row.notification_id,
        user_id: row.user_id,
        item_id: row.item_id,
        message: row.message,
        is_read: !!row.is_read,
        created_at: row.created_at,
        read_at: row.read_at,
        item_type: row.item_type,
        image_path: row.image_path,
        student: (row.student_id || row.student_name || row.student_email) ? {
          user_id: row.student_id,
          name: row.student_name,
          email: row.student_email,
          phone: row.student_phone,
          class: row.student_class,
          school: row.student_school,
          grade: row.student_grade,
        } : null,
        notification_type: row.notification_type,
        created_by_admin: row.created_by_admin,
      }));

      res.json({ notifications });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // Mark notification as read
  router.put('/notifications/:id/read', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userId;
      
      const connection = await pool.getConnection();
      
      // Verify ownership
      const [check] = await connection.execute(
        'SELECT user_id FROM notifications WHERE notification_id = ? AND user_id = ?',
        [id, userId]
      );
      
      if (check.length === 0) {
        connection.release();
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      await connection.execute(
        'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE notification_id = ?',
        [id]
      );
      
      connection.release();
      res.json({ message: 'Notification marked as read' });
    } catch (error) {
      console.error('Error updating notification:', error);
      res.status(500).json({ error: 'Failed to update notification' });
    }
  });

  // Request pickup endpoint
  router.post('/request-pickup', verifyToken, async (req, res) => {
    try {
      const { found_item_id } = req.body;
      const userId = req.userId;

      if (!found_item_id) {
        return res.status(400).json({ error: 'Found item ID is required' });
      }

      const connection = await pool.getConnection();

      // Get the found item details
      const [items] = await connection.execute(
        `SELECT item_id, user_id, item_type, color, size, location_found, status 
         FROM items 
         WHERE item_id = ? AND status = 'found'`,
        [found_item_id]
      );

      if (items.length === 0) {
        connection.release();
        return res.status(404).json({ error: 'Found item not found' });
      }

      const foundItem = items[0];
      const finderUserId = foundItem.user_id;

      // Get requester info (student who requested pickup)
      const [requester] = await connection.execute(
        `SELECT name, email, phone, \`class\`, school, grade FROM users WHERE user_id = ?`,
        [userId]
      );

      if (requester.length === 0) {
        connection.release();
        return res.status(404).json({ error: 'User not found' });
      }

      const requesterName = requester[0].name;
      const requesterEmail = requester[0].email;
      const requesterPhone = requester[0].phone;
      const requesterClass = requester[0].class;
      const requesterSchool = requester[0].school;
      const requesterGrade = requester[0].grade;

      // Create notification for the finder
      await connection.execute(
        `INSERT INTO notifications (user_id, item_id, message, is_read)
         VALUES (?, ?, ?, FALSE)`,
        [
          finderUserId,
          found_item_id,
          `${requesterName} requested to pick up the item: ${foundItem.item_type} (${foundItem.color}, ${foundItem.size}) from ${foundItem.location_found || 'unknown location'}. Please contact them.`
        ]
      );

      // Also create notification for admin with student details
      const [admins] = await connection.execute(
        `SELECT user_id FROM users WHERE role = 'admin'`
      );

      const adminMessage = `Pickup Request: Student ${requesterName} (${requesterEmail}) wants the item: ${foundItem.item_type} - ${foundItem.color} - ${foundItem.size} from ${foundItem.location_found || 'unknown location'}`;

      for (const admin of admins) {
        await connection.execute(
          `INSERT INTO notifications (user_id, item_id, message, is_read, student_id, student_name, student_email, student_phone, student_class, student_school, student_grade, notification_type, created_by_admin)
           VALUES (?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, 'pickup_request', 0)`,
          [
            admin.user_id,
            found_item_id,
            adminMessage,
            userId,
            requesterName,
            requesterEmail,
            requesterPhone || null,
            requesterClass || null,
            requesterSchool || null,
            requesterGrade || null,
          ]
        );
      }

      connection.release();

      console.log(`✅ Pickup request created by user ${userId} for item ${found_item_id}`);
      res.json({ 
        success: true, 
        message: 'Pickup request sent successfully. The finder and admin will be notified.' 
      });
    } catch (error) {
      console.error('Error creating pickup request:', error);
      res.status(500).json({ error: 'Failed to create pickup request' });
    }
  });

  return router;
};
