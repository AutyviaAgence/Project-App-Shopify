-- Migration v2: Enrich link_clicks with geo, UA, UTM, and uniqueness data
-- Run this on your Supabase SQL Editor

ALTER TABLE link_clicks
  ADD COLUMN IF NOT EXISTS country      TEXT,
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS device_type  TEXT,
  ADD COLUMN IF NOT EXISTS os           TEXT,
  ADD COLUMN IF NOT EXISTS browser      TEXT,
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS is_unique    BOOLEAN DEFAULT true;

-- Index for efficient uniqueness check (link_id + ip_hash)
CREATE INDEX IF NOT EXISTS idx_link_clicks_link_ip
  ON link_clicks(link_id, ip_hash);
