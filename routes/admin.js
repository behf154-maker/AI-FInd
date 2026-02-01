const express = require('express');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT and admin role
const verifyAdminToken = async (req, res, next, pool) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    req.userId = decoded.userId;

    // Check if user is admin
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT role FROM users WHERE user_id = ?',
      [decoded.userId]
    );
    connection.release();

    if (rows.length === 0 || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = (pool) => {
  const router = express.Router();

  // Dashboard stats
  router.get('/stats', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const connection = await pool.getConnection();

      const [lostCount] = await connection.execute(
        'SELECT COUNT(*) as count FROM items WHERE status = "lost"'
      );
      const [foundCount] = await connection.execute(
        'SELECT COUNT(*) as count FROM items WHERE status = "found"'
      );
      const [claimedCount] = await connection.execute(
        'SELECT COUNT(*) as count FROM items WHERE status = "claimed"'
      );
      const [usersCount] = await connection.execute(
        'SELECT COUNT(*) as count FROM users'
      );

      connection.release();

      res.json({
        lostItems: lostCount[0].count,
        foundItems: foundCount[0].count,
        claimedItems: claimedCount[0].count,
        totalUsers: usersCount[0].count,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Get all items
  router.get('/items', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const connection = await pool.getConnection();

      const [rows] = await connection.execute(
        'SELECT * FROM items ORDER BY date_reported DESC'
      );

      connection.release();

      res.json({ items: rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  // Get all users
  router.get('/users', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const connection = await pool.getConnection();

      const [rows] = await connection.execute(
        'SELECT user_id, name, email, role, student_name, school, grade, is_banned, banned_at, banned_reason, created_at FROM users'
      );

      connection.release();

      res.json({ users: rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Update item status
  router.put('/items/:itemId/status', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const { itemId } = req.params;
      const { status } = req.body;

      const connection = await pool.getConnection();

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
  router.delete('/items/:itemId', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const { itemId } = req.params;

      const connection = await pool.getConnection();

      await connection.execute('DELETE FROM items WHERE item_id = ?', [itemId]);

      connection.release();

      res.json({ message: 'Item deleted' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete item' });
    }
  });

  // Ban user
  router.put('/users/:id/ban', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const connection = await pool.getConnection();
      
      // Check if user exists
      const [user] = await connection.execute(
        'SELECT user_id, role FROM users WHERE user_id = ?',
        [id]
      );
      
      if (user.length === 0) {
        connection.release();
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Prevent banning admins
      if (user[0].role === 'admin') {
        connection.release();
        return res.status(403).json({ error: 'Cannot ban admin users' });
      }
      
      await connection.execute(
        'UPDATE users SET is_banned = TRUE, banned_at = NOW(), banned_reason = ? WHERE user_id = ?',
        [reason || 'No reason provided', id]
      );
      
      connection.release();
      res.json({ message: 'User banned successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to ban user' });
    }
  });

  // Unban user
  router.put('/users/:id/unban', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const { id } = req.params;

      const connection = await pool.getConnection();
      
      await connection.execute(
        'UPDATE users SET is_banned = FALSE, banned_at = NULL, banned_reason = NULL WHERE user_id = ?',
        [id]
      );
      
      connection.release();
      res.json({ message: 'User unbanned successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to unban user' });
    }
  });

  return router;
};
