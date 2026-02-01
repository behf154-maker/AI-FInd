-- Add new fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS student_name VARCHAR(100) AFTER name,
ADD COLUMN IF NOT EXISTS school ENUM('Diploma', 'General') AFTER student_name,
ADD COLUMN IF NOT EXISTS grade VARCHAR(50) AFTER school,
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE AFTER role,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP NULL AFTER is_banned,
ADD COLUMN IF NOT EXISTS banned_reason TEXT AFTER banned_at;

-- Add index for banned users
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);

