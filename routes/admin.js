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

  // Get all items with reporter (student) details
  router.get('/items', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const connection = await pool.getConnection();

      const [rows] = await connection.execute(
        `SELECT 
          i.item_id, i.user_id, i.item_type, i.category, i.subcategory,
          i.color, i.size, i.material, i.brand, i.location_found, i.date_found,
          i.unique_marks, i.pattern, i.image_path, i.status, i.date_reported,
          i.description, i.created_at, i.updated_at,
          u.name AS student_name, u.email AS student_email, u.phone AS student_phone,
          u.class AS student_class, u.school AS student_school, u.grade AS student_grade
        FROM items i
        LEFT JOIN users u ON u.user_id = i.user_id
        ORDER BY i.date_reported DESC`
      );

      connection.release();

      const items = rows.map((row) => {
        const { student_name, student_email, student_phone, student_class, student_school, student_grade, ...item } = row;
        return {
          item_id: row.item_id,
          user_id: row.user_id,
          item_type: row.item_type,
          category: row.category,
          subcategory: row.subcategory,
          color: row.color,
          size: row.size,
          material: row.material,
          brand: row.brand,
          location_found: row.location_found,
          date_found: row.date_found,
          unique_marks: row.unique_marks,
          pattern: row.pattern,
          image_path: row.image_path,
          status: row.status,
          date_reported: row.date_reported,
          description: row.description,
          created_at: row.created_at,
          updated_at: row.updated_at,
          reported_by: row.user_id ? {
            user_id: row.user_id,
            name: student_name,
            email: student_email,
            phone: student_phone,
            class: student_class,
            school: student_school,
            grade: student_grade,
          } : null,
        };
      });

      res.json({ items });
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
        'SELECT user_id, name, email, role, student_name, school, grade, phone, class, is_banned, banned_at, banned_reason, created_at FROM users'
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

  // Notify student about found item (admin manual notification)
  router.post('/items/:itemId/notify', async (req, res, next) => {
    verifyAdminToken(req, res, next, pool);
  }, async (req, res) => {
    try {
      const itemId = req.params.itemId;
      const { student_email, message, target_lost_item_id } = req.body;

      if (!student_email || typeof student_email !== 'string' || !student_email.trim()) {
        return res.status(400).json({ error: 'student_email is required' });
      }

      const connection = await pool.getConnection();

      const [itemRows] = await connection.execute(
        `SELECT i.item_id, i.item_type, i.user_id, i.image_path,
                u.name, u.email, u.phone, u.class, u.school, u.grade
         FROM items i
         LEFT JOIN users u ON u.user_id = i.user_id
         WHERE i.item_id = ?`,
        [itemId]
      );

      if (itemRows.length === 0) {
        connection.release();
        return res.status(404).json({ error: 'Item not found' });
      }

      const [studentRows] = await connection.execute(
        'SELECT user_id, name, email, phone, class, school, grade FROM users WHERE email = ?',
        [student_email.trim()]
      );

      if (studentRows.length === 0) {
        connection.release();
        return res.status(404).json({ error: 'No user found with that email' });
      }

      const student = studentRows[0];
      const defaultMessage = message && message.trim()
        ? message.trim()
        : `Your lost item has been found. Item: ${itemRows[0].item_type} (ID #${itemId}). Please visit the office to collect it.`;

      await connection.execute(
        `INSERT INTO notifications
         (user_id, item_id, message, is_read, student_id, student_name, student_email, student_phone, student_class, student_school, student_grade, notification_type, created_by_admin)
         VALUES (?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, 'manual_admin_notify', 1)`,
        [
          student.user_id,
          itemId,
          defaultMessage,
          student.user_id,
          student.name,
          student.email,
          student.phone || null,
          student.class || null,
          student.school || null,
          student.grade || null,
        ]
      );

      connection.release();
      res.status(201).json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to notify student' });
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
