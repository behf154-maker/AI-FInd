const aiMatchingService = require('./aiMatchingService');

/**
 * Automatic Matching Service
 * When a lost item is reported, automatically search for matching found items
 * and create notifications
 */
class MatchingService {
  /**
   * Check for matches when a lost item is reported
   * @param {Object} lostItem - The lost item object
   * @param {Object} pool - Database connection pool
   */
  async checkLostItemMatches(lostItem, pool) {
    try {
      console.log('🔍 Checking for matches for lost item:', lostItem.item_id);

      const connection = await pool.getConnection();

      // Get all found items with same category/subcategory
      const [foundItems] = await connection.execute(
        `SELECT * FROM items 
         WHERE status = 'found' 
         AND item_id != ?
         ${lostItem.category ? 'AND (category = ? OR category IS NULL)' : ''}
         ${lostItem.subcategory ? 'AND (subcategory = ? OR subcategory IS NULL)' : ''}
         ORDER BY date_reported DESC
         LIMIT 20`,
        lostItem.category && lostItem.subcategory
          ? [lostItem.item_id, lostItem.category, lostItem.subcategory]
          : lostItem.category
          ? [lostItem.item_id, lostItem.category]
          : [lostItem.item_id]
      );

      if (foundItems.length === 0) {
        connection.release();
        console.log('   No found items to match against');
        return;
      }

      // Analyze lost item image if available
      let lostItemFeatures = null;
      if (lostItem.image_path) {
        try {
          lostItemFeatures = await aiMatchingService.extractImageFeaturesFromUrl(lostItem.image_path);
        } catch (error) {
          console.warn('   Could not analyze lost item image:', error.message);
        }
      }

      // Check each found item for match
      const matches = [];
      for (const foundItem of foundItems) {
        let matchScore = 0;

        // Category match (30 points)
        if (lostItem.category && foundItem.category && lostItem.category === foundItem.category) {
          matchScore += 30;
        }

        // Subcategory match (20 points)
        if (lostItem.subcategory && foundItem.subcategory && lostItem.subcategory === foundItem.subcategory) {
          matchScore += 20;
        }

        // Color match (15 points)
        if (lostItem.color && foundItem.color && 
            lostItem.color.toLowerCase() === foundItem.color.toLowerCase()) {
          matchScore += 15;
        }

        // Size match (10 points)
        if (lostItem.size && foundItem.size && 
            lostItem.size.toLowerCase() === foundItem.size.toLowerCase()) {
          matchScore += 10;
        }

        // AI image matching (25 points if available)
        if (lostItemFeatures && foundItem.image_path) {
          try {
            const foundItemFeatures = await aiMatchingService.extractImageFeaturesFromUrl(foundItem.image_path);
            if (foundItemFeatures && foundItemFeatures.labels) {
              // Check label overlap
              const lostLabels = lostItemFeatures.labels.map(l => l.description);
              const foundLabels = foundItemFeatures.labels.map(l => l.description);
              const commonLabels = lostLabels.filter(l => foundLabels.includes(l));
              
              if (commonLabels.length > 0) {
                matchScore += Math.min(25, commonLabels.length * 5);
              }
            }
          } catch (error) {
            // Ignore AI matching errors
          }
        }

        // Only create match if score > 40
        if (matchScore >= 40) {
          matches.push({
            foundItem,
            matchScore,
          });
        }
      }

      // Sort by match score
      matches.sort((a, b) => b.matchScore - a.matchScore);

      // Create notifications for top 3 matches
      for (const match of matches.slice(0, 3)) {
        await connection.execute(
          `INSERT INTO notifications (user_id, item_id, message, is_read)
           VALUES (?, ?, ?, FALSE)`,
          [
            lostItem.user_id,
            match.foundItem.item_id,
            `Potential match found! A ${match.foundItem.item_type} (${match.foundItem.color}) was found that matches your lost item. Match confidence: ${Math.round(match.matchScore)}%`,
          ]
        );

        // Also create match record
        await connection.execute(
          `INSERT INTO matches (lost_item_id, found_item_id, match_score, status)
           VALUES (?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE match_score = ?`,
          [
            lostItem.item_id,
            match.foundItem.item_id,
            match.matchScore,
            match.matchScore,
          ]
        );
      }

      connection.release();

      if (matches.length > 0) {
        console.log(`✅ Created ${matches.length} potential matches and notifications`);
      } else {
        console.log('   No matches found above threshold');
      }
    } catch (error) {
      console.error('❌ Error checking matches:', error);
    }
  }
}

module.exports = new MatchingService();



