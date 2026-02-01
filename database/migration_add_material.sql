w33w-- Migration script to add material column to items table
-- Run this if the database already exists

USE ai_lost_and_found;

-- Add category and subcategory columns if they don't exist
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) AFTER item_type,
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(50) AFTER category;

-- Add material column
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS material VARCHAR(50) AFTER size;

