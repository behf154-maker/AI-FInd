-- Add new fields to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS mark VARCHAR(255) AFTER material,
ADD COLUMN IF NOT EXISTS subject VARCHAR(100) AFTER mark,
ADD COLUMN IF NOT EXISTS grade VARCHAR(50) AFTER subject;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_items_mark ON items(mark);
CREATE INDEX IF NOT EXISTS idx_items_subject ON items(subject);
CREATE INDEX IF NOT EXISTS idx_items_grade ON items(grade);
