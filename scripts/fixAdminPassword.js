const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixAdminPassword() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_lost_and_found',
  });

  try {
    const email = 'admin@example.com';
    const plainPassword = '123456';
    
    // Generate new hash
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log('Generated hash:', hashedPassword);
    
    // Update admin password
    const connection = await pool.getConnection();
    const [result] = await connection.execute(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );
    connection.release();
    
    console.log(`Updated ${result.affectedRows} row(s) for ${email}`);
    console.log('Admin password has been reset to: 123456');
    console.log('You can now login with:');
    console.log('  Email: admin@example.com');
    console.log('  Password: 123456');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixAdminPassword();

