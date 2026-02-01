const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = (pool) => {
  const router = express.Router();

  // Initialize Gemini AI
  const genAI = process.env.GEMINI_API_KEY 
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

  // Helper function to extract search terms from message
  function extractSearchTerms(message) {
    const lowerMessage = message.toLowerCase();
    const words = lowerMessage.split(/[\s,]+/).filter(w => w.length > 1);
    return words;
  }

  // Chatbot endpoint - uses Gemini AI to answer questions about items in database
  router.post('/chat', async (req, res) => {
    try {
      const { message } = req.body;
      const connection = await pool.getConnection();

      // Extract search terms
      const searchTerms = extractSearchTerms(message);
      
      // Build smart SQL query
      let whereConditions = [];
      let params = [];
      
      // Search in multiple fields
      for (const term of searchTerms) {
        const likeTerm = `%${term}%`;
        whereConditions.push(`(
          item_type LIKE ? OR 
          category LIKE ? OR 
          subcategory LIKE ? OR 
          color LIKE ? OR 
          description LIKE ? OR
          location_found LIKE ?
        )`);
        params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
      }
      
      const whereClause = whereConditions.length > 0 
        ? `WHERE status = 'found' AND (${whereConditions.join(' OR ')})`
        : `WHERE status = 'found'`;
      
      // Get statistics
      const [stats] = await connection.execute(
        `SELECT 
          COUNT(*) as total_found,
          COUNT(DISTINCT category) as categories_count,
          COUNT(DISTINCT color) as colors_count
         FROM items 
         WHERE status = 'found'`
      );
      
      // Search in items
      const [items] = await connection.execute(
        `SELECT item_id, item_type, category, subcategory, color, size, location_found, status, description, date_reported, image_path
         FROM items 
         ${whereClause}
         ORDER BY date_reported DESC
         LIMIT 10`,
        params
      );

      connection.release();

      // Prepare context for Gemini
      const statsData = stats[0];
      const itemsContext = items.map(item => ({
        id: item.item_id,
        type: item.item_type || 'Unknown',
        category: item.category || 'Other',
        subcategory: item.subcategory || 'Other',
        color: item.color || 'Unknown',
        size: item.size || 'Unknown',
        location: item.location_found || 'Unknown',
        description: item.description || 'No description',
        date: item.date_reported
      }));

      // Use Gemini AI if available, otherwise use simple response
      let response = '';
      
      if (genAI && message.toLowerCase().trim().length > 0) {
        try {
          // Use gemini-1.5-flash for faster responses, fallback to gemini-1.5-pro if needed
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          
          const prompt = `You are a helpful assistant for a Lost and Found system. Answer the user's question based on the following database information:

Database Statistics:
- Total found items: ${statsData.total_found}
- Number of categories: ${statsData.categories_count}
- Number of different colors: ${statsData.colors_count}

Found Items (${items.length} items):
${itemsContext.length > 0 ? JSON.stringify(itemsContext, null, 2) : 'No items found matching the search criteria.'}

User Question: "${message}"

Instructions:
- If the user asks about statistics, provide the database statistics in a friendly way.
- If items are found, summarize them clearly and helpfully.
- If no items are found, suggest alternative search terms or categories.
- Be concise, friendly, and helpful.
- Use emojis appropriately.
- Format your response clearly with line breaks.

Response:`;

          const result = await model.generateContent(prompt);
          const geminiResponse = result.response;
          response = geminiResponse.text();
          
          // If response is empty or too short, use fallback
          if (!response || response.trim().length < 10) {
            console.log('Gemini response too short, using fallback');
            response = generateSimpleResponse(items, statsData, message);
          }
        } catch (geminiError) {
          console.error('Gemini API error:', geminiError);
          // Try with gemini-1.5-pro as fallback
          try {
            const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
            const result = await fallbackModel.generateContent(prompt);
            const geminiResponse = result.response;
            response = geminiResponse.text();
            
            if (!response || response.trim().length < 10) {
              response = generateSimpleResponse(items, statsData, message);
            }
          } catch (fallbackError) {
            console.error('Gemini fallback also failed:', fallbackError);
            // Final fallback to simple response
            response = generateSimpleResponse(items, statsData, message);
          }
        }
      } else {
        // Fallback to simple response if Gemini is not available
        response = generateSimpleResponse(items, statsData, message);
      }

      res.json({ 
        response, 
        items: items.slice(0, 5),
        stats: statsData
      });
    } catch (error) {
      console.error('Chatbot error:', error);
      res.status(500).json({ error: 'Chatbot service unavailable' });
    }
  });

  // Helper function to generate simple response when Gemini is not available
  function generateSimpleResponse(items, statsData, message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('statistics') || lowerMessage.includes('stats')) {
      return `📊 Database Statistics:\n` +
             `• Total found items: ${statsData.total_found}\n` +
             `• Number of categories: ${statsData.categories_count}\n` +
             `• Number of different colors: ${statsData.colors_count}`;
    } else if (items.length === 0) {
      return `I couldn't find any matching items in the database. ` +
             `Try searching with different keywords or use the search page. ` +
             `\n\n💡 Tip: You can search by:\n` +
             `• Item type (e.g., phone, pen, wallet)\n` +
             `• Color (e.g., red, blue)\n` +
             `• Category (e.g., clothing, electronics)`;
    } else if (items.length === 1) {
      const item = items[0];
      let response = `✅ I found 1 matching item:\n\n`;
      response += `📦 Type: ${item.item_type || 'Unknown'}\n`;
      if (item.category) response += `📁 Category: ${item.category}\n`;
      if (item.color) response += `🎨 Color: ${item.color}\n`;
      if (item.size) response += `📏 Size: ${item.size}\n`;
      if (item.location_found) response += `📍 Location: ${item.location_found}\n`;
      if (item.description) response += `📝 Description: ${item.description.substring(0, 100)}...\n`;
      response += `\nCheck the results page for full details.`;
      return response;
    } else {
      let response = `✅ I found ${items.length} matching items:\n\n`;
      
      // Group by category
      const byCategory = {};
      items.forEach(item => {
        const cat = item.category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item);
      });
      
      Object.entries(byCategory).forEach(([cat, catItems]) => {
        response += `📁 ${cat}: ${catItems.length} item(s)\n`;
      });
      
      // Show top items
      response += `\nTop items:\n`;
      items.slice(0, 5).forEach((item, idx) => {
        response += `${idx + 1}. ${item.item_type || 'Unknown'}`;
        if (item.color) response += ` (${item.color})`;
        if (item.location_found) response += ` - ${item.location_found}`;
        response += `\n`;
      });
      
      response += `\nCheck the results page for full details.`;
      return response;
    }
  }

  return router;
};

