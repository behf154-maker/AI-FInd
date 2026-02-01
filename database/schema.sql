-- Create database
CREATE DATABASE IF NOT EXISTS ai_lost_and_found;
USE ai_lost_and_found;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'teacher', 'admin') DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Items table
CREATE TABLE IF NOT EXISTS items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_type VARCHAR(100) NOT NULL,
   category VARCHAR(50),
  subcategory VARCHAR(50),
  color VARCHAR(100),
  size VARCHAR(50),
  material VARCHAR(50),
  brand VARCHAR(100),
  location_found VARCHAR(255),
  date_found DATE,
  unique_marks TEXT,
  pattern VARCHAR(100),
  image_path VARCHAR(255),
  status ENUM('lost', 'found', 'claimed') DEFAULT 'lost',
  date_reported TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_item_type (item_type),
  INDEX idx_color (color)
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  match_id INT AUTO_INCREMENT PRIMARY KEY,
  lost_item_id INT NOT NULL,
  found_item_id INT NOT NULL,
  match_score FLOAT,
  status ENUM('pending', 'confirmed', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (lost_item_id) REFERENCES items(item_id) ON DELETE CASCADE,
  FOREIGN KEY (found_item_id) REFERENCES items(item_id) ON DELETE CASCADE,
  UNIQUE KEY unique_match (lost_item_id, found_item_id),
  INDEX idx_match_score (match_score)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_id INT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read)
);

-- Create indexes for better performance
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_date_reported ON items(date_reported);
CREATE INDEX idx_matches_lost_item ON matches(lost_item_id);
CREATE INDEX idx_matches_found_item ON matches(found_item_id);
