const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// MySQL connection pool (stable for Railway)
const usePublicUrl = !!process.env.MYSQL_PUBLIC_URL && process.env.USE_MYSQL_PUBLIC_URL === "true";

const poolConfig = usePublicUrl
  ? process.env.MYSQL_PUBLIC_URL
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "railway",

      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,

      // IMPORTANT: reduce random disconnects
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,

      // timeouts
      connectTimeout: 10000,
    };

const pool = mysql.createPool(poolConfig);

// Optional: log pool errors (doesn't crash the app)
pool.on("error", (err) => {
  console.error("MySQL pool error:", err?.code || err);
});

// Test DB connection on startup (so you see errors early)
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("✅ MySQL connected & ping OK");
  } catch (e) {
    console.error("❌ MySQL connection failed:", e?.code || e);
  }
})();


// Routes
app.use('/api/auth', require('./routes/auth')(pool));
app.use('/api/items', require('./routes/items')(pool, upload));
app.use('/api/admin', require('./routes/admin')(pool));
app.use('/api/ai', require('./routes/ai-test')(upload));
app.use('/api/chatbot', require('./routes/chatbot')(pool));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📱 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://YOUR_IP_ADDRESS:${PORT}`);
  console.log(`📋 Make sure to update IP in lib/config/api_config.dart`);
  console.log(`\n⚠️  If connection fails, check:`);
  console.log(`   1. Firewall allows port ${PORT}`);
  console.log(`   2. IP address is correct`);
  console.log(`   3. Device and server are on same network\n`);
});


module.exports = app;
