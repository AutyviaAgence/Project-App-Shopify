-- Migration: Per-tenant light/dark theme configuration
-- Run in Supabase SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS theme_config JSONB;

-- Xeyo: light = gris clair/noir/bleu, dark = noir/blanc/bleu
UPDATE tenants SET theme_config = '{
  "light": {
    "primary": "#365EFF",
    "accent": "#365EFF",
    "sidebar": "#FFFFFF",
    "background": "#F5F5F5",
    "foreground": "#000000"
  },
  "dark": {
    "primary": "#365EFF",
    "accent": "#365EFF",
    "sidebar": "#000000",
    "background": "#000000",
    "foreground": "#FFFFFF"
  }
}'::jsonb
WHERE slug = 'xeyo';
