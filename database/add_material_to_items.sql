-- Add material field to items table if not exists
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS material VARCHAR(100) AFTER size;

