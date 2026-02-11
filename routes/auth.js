const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

module.exports = (pool) => {
  const router = express.Router();

  // Register with new fields
  router.post(
    '/register',
    [
      body('name').notEmpty().withMessage('Name is required'),
      body('email').isEmail().withMessage('Valid email is required'),
      body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
      body('phone').optional().isMobilePhone().withMessage('Valid phone number is required'),
      body('class').optional().trim(),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      let connection;
      try {
        const { name, email, password, role, school, grade, phone, class: studentClass } = req.body;
        connection = await pool.getConnection();

        // Check if user exists
        const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
          connection.release();
          return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user with new fields
        await connection.execute(
          `INSERT INTO users (name, email, password, role, school, grade, phone, class) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, email, hashedPassword, role || 'student', school || null, grade || null, phone || null, studentClass || null]
        );

        // Get user ID
        const [newUser] = await connection.execute('SELECT user_id FROM users WHERE email = ?', [email]);
        const userId = newUser[0].user_id;

        // Generate token
        const token = jwt.sign(
          { userId, email },
          process.env.JWT_SECRET || 'your_secret_key',
          { expiresIn: '7d' }
        );

        // Get complete user data
        const [userData] = await connection.execute(
          'SELECT user_id, name, email, role, school, grade, phone, class FROM users WHERE user_id = ?',
          [userId]
        );

        const user = userData[0];
        connection.release();

        res.status(201).json({
          token,
          userId: user.user_id,
          userName: user.name,
          email: user.email,
          role: user.role || 'student',
          school: user.school,
          grade: user.grade,
          phone: user.phone,
          class: user.class,
          message: 'User registered successfully',
        });
      } catch (error) {
        if (connection) connection.release();
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
      }
    }
  );

  // Login - Updated to return new fields
  router.post(
    '/login',
    [
      body('email').isEmail().withMessage('Valid email is required'),
      body('password').notEmpty().withMessage('Password is required'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      let connection;
      try {
        const { email, password } = req.body;
        connection = await pool.getConnection();

        // Find user
        const [rows] = await connection.execute(
          'SELECT user_id, name, email, password, role, school, grade, phone, class, is_banned FROM users WHERE email = ?',
          [email]
        );
        connection.release();

        if (rows.length === 0) {
          console.log(`Login attempt failed: User not found for email: ${email}`);
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = rows[0];

        // Check if user is banned
        if (user.is_banned) {
          console.log(`Login attempt blocked: User ${email} is banned`);
          return res.status(403).json({ error: 'Your account has been banned. Please contact the administrator.' });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          console.log(`Password comparison failed for: ${email}`);
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate token
        const token = jwt.sign(
          { userId: user.user_id, email: user.email },
          process.env.JWT_SECRET || 'your_secret_key',
          { expiresIn: '7d' }
        );

        res.json({
          token,
          userId: user.user_id,
          userName: user.name,
          email: user.email,
          role: user.role || 'student',
          school: user.school,
          grade: user.grade,
          phone: user.phone,
          class: user.class,
          message: 'Login successful',
        });
      } catch (error) {
        if (connection) connection.release();
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
      }
    }
  );

  return router;
};
