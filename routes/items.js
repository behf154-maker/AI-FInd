const express = require('express');

module.exports = (pool, verifyToken, verifyAdmin) => {
  const router = express.Router();

  // Get admin items with student details
  router.get('/admin/items', verifyAdmin, async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();
      
      const [rows] = await connection.execute(`
        SELECT
          i.item_id,
          i.item_type,
          i.color,
          i.size,
          i.material,
          i.location_found,
          i.description,
          i.status,
          i.image_path,
          i.date_reported,
          i.date_found,
          i.created_at,
          i.updated_at,
          u.user_id,
          u.name AS student_name,
          u.email AS student_email,
          u.phone AS student_phone,
          u.class AS student_class,
          u.school AS student_school,
          u.grade AS student_grade
        FROM items i
        LEFT JOIN users u ON u.user_id = i.user_id
        ORDER BY i.date_reported DESC
      `);

      connection.release();

      const items = rows.map((row) => ({
        item_id: row.item_id,
        item_type: row.item_type,
        color: row.color,
        size: row.size,
        material: row.material,
        location_found: row.location_found,
        description: row.description,
        status: row.status,
        image_path: row.image_path,
        date_reported: row.date_reported,
        date_found: row.date_found,
        created_at: row.created_at,
        updated_at: row.updated_at,
        reported_by: row.user_id ? {
          user_id: row.user_id,
          name: row.student_name,
          email: row.student_email,
          phone: row.student_phone,
          class: row.student_class,
          school: row.student_school,
          grade: row.student_grade,
        } : null,
      }));

      res.json({ items });
    } catch (error) {
      if (connection) connection.release();
      console.error('Error fetching admin items:', error);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  // Get notifications with student details
  router.get('/notifications', verifyToken, async (req, res) => {
    let connection;
    try {
      const userId = req.userId;
      connection = await pool.getConnection();

      const [rows] = await connection.execute(`
        SELECT
          n.notification_id,
          n.message,
          n.is_read,
          n.created_at,
          n.item_id,
          i.item_type,
          i.image_path,
          u.user_id,
          u.name,
          u.email,
          u.phone,
          u.class,
          u.school,
          u.grade
        FROM notifications n
        LEFT JOIN items i ON i.item_id = n.item_id
        LEFT JOIN users u ON u.user_id = n.student_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC
      `, [userId]);

      connection.release();

      const notifications = rows.map((row) => ({
        notification_id: row.notification_id,
        message: row.message,
        is_read: !!row.is_read,
        created_at: row.created_at,
        item_id: row.item_id,
        item_type: row.item_type,
        image_path: row.image_path,
        student: row.user_id ? {
          user_id: row.user_id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          class: row.class,
          school: row.school,
          grade: row.grade,
        } : null,
      }));

      res.json({ notifications });
    } catch (error) {
      if (connection) connection.release();
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // Admin notify student endpoint
  router.post('/admin/items/:id/notify', verifyAdmin, async (req, res) => {
    let connection;
    try {
      const itemId = req.params.id;
      const { student_email, target_lost_item_id, message } = req.body;

      if (!student_email) {
        return res.status(400).json({ error: 'student_email is required' });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Get item and student data
        const [[item]] = await connection.execute(`
          SELECT 
            i.item_id, 
            i.item_type, 
            i.user_id,
            u.name, 
            u.email, 
            u.phone, 
            u.class, 
            u.school, 
            u.grade
          FROM items i
          LEFT JOIN users u ON u.user_id = i.user_id
          WHERE i.item_id = ?
        `, [itemId]);

        if (!item) {
          await connection.rollback();
          return res.status(404).json({ error: 'Item not found' });
        }

        // Insert notification
        const notificationMessage = message || 'تم العثور على غرضك. يرجى مراجعة الإدارة.';
        
        await connection.execute(`
          INSERT INTO notifications
            (user_id, item_id, message,
             student_id, student_name, student_email, student_phone,
             student_class, student_school, student_grade,
             notification_type, created_by_admin, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
        `, [
          item.user_id,
          itemId,
          notificationMessage,
          item.user_id,
          item.name,
          student_email,
          item.phone,
          item.class,
          item.school,
          item.grade,
          'manual_admin_notify',
        ]);

        await connection.commit();
        connection.release();

        res.status(201).json({ 
          success: true,
          message: 'Student notified successfully' 
        });
      } catch (innerError) {
        await connection.rollback();
        throw innerError;
      }
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {
          console.error('Rollback error:', e);
        }
        connection.release();
      }
      console.error('Error notifying student:', error);
      res.status(500).json({ error: 'Failed to notify student' });
    }
  });

  return router;
};
