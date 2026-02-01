-- Add category and subcategory columns to items table
ALTER TABLE items 
ADD COLUMN category VARCHAR(50) AFTER item_type,
ADD COLUMN subcategory VARCHAR(50) AFTER category,
ADD INDEX idx_category (category),
ADD INDEX idx_subcategory (subcategory);

-- Update existing items with categories based on item_type
UPDATE items SET category = 'clothing', subcategory = 'other' WHERE item_type LIKE '%shirt%' OR item_type LIKE '%t-shirt%' OR item_type LIKE '%clothing%';
UPDATE items SET category = 'clothing', subcategory = 'pants' WHERE item_type LIKE '%pants%' OR item_type LIKE '%jeans%';
UPDATE items SET category = 'electronics', subcategory = 'watch' WHERE item_type LIKE '%watch%';
UPDATE items SET category = 'electronics', subcategory = 'phone' WHERE item_type LIKE '%phone%';
UPDATE items SET category = 'school_supplies', subcategory = 'pen' WHERE item_type LIKE '%pen%' OR item_type LIKE '%pencil%';
UPDATE items SET category = 'school_supplies', subcategory = 'book' WHERE item_type LIKE '%book%' OR item_type LIKE '%notebook%';
UPDATE items SET category = 'personal_items', subcategory = 'wallet' WHERE item_type LIKE '%wallet%';
UPDATE items SET category = 'personal_items', subcategory = 'keys' WHERE item_type LIKE '%key%';
UPDATE items SET category = 'personal_items', subcategory = 'bag' WHERE item_type LIKE '%bag%' OR item_type LIKE '%backpack%';
UPDATE items SET category = 'money', subcategory = 'cash' WHERE item_type LIKE '%money%' OR item_type LIKE '%cash%';
UPDATE items SET category = 'money', subcategory = 'card' WHERE item_type LIKE '%card%' OR item_type LIKE '%id%';

-- Set default for items without category
UPDATE items SET category = 'other', subcategory = 'other' WHERE category IS NULL;

