-- Migration: Extended tenant branding (background, text color)
-- Run in Supabase SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bg_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS text_color TEXT;

-- Xeyo branding: fond noir, texte blanc, bleu CTA
UPDATE tenants SET
  bg_color = '#000000',
  text_color = '#FFFFFF',
  primary_color = '#365EFF',
  accent_color = '#365EFF',
  sidebar_color = '#000000'
WHERE slug = 'xeyo';
