const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

module.exports = (pool) => {
  const router = express.Router();

  // Register
  router.post(
    '/register',
    [
      body('name').notEmpty().withMessage('Name is required'),
      body('email').isEmail().withMessage('Valid email is required'),
      body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      try {
        const { name, email, password, role, school, grade } = req.body;
        const connection = await pool.getConnection();

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
          'INSERT INTO users (name, email, password, role, school, grade) VALUES (?, ?, ?, ?, ?, ?)',
          [name, email, hashedPassword, role || 'student', school || null, grade || null]
        );

        // Get user ID
        const [newUser] = await connection.execute('SELECT user_id FROM users WHERE email = ?', [email]);
        connection.release();

        // Generate token
        const token = jwt.sign(
          { userId: newUser[0].user_id, email },
          process.env.JWT_SECRET || 'your_secret_key',
          { expiresIn: '7d' }
        );

        // Get user role
        const [userData] = await connection.execute('SELECT role FROM users WHERE user_id = ?', [newUser[0].user_id]);
        const userRole = userData[0]?.role || 'student';

        res.status(201).json({
          token,
          userId: newUser[0].user_id,
          userName: name,
          email: email,
          role: userRole,
          message: 'User registered successfully',
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Registration failed' });
      }
    }
  );

  // Login
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

      try {
        const { email, password } = req.body;
        const connection = await pool.getConnection();

        // Find user
        const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
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
        
        // Debug logging
        console.log(`Login attempt for: ${email}`);
        console.log(`Stored password hash length: ${user.password?.length || 0}`);
        console.log(`Stored password hash starts with: ${user.password?.substring(0, 10) || 'N/A'}`);

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          console.log(`Password comparison failed for: ${email}`);
          // Try to rehash if password seems correct but hash doesn't match
          // This helps identify if the hash format is wrong
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
          message: 'Login successful',
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
      }
    }
  );

  return router;
};
