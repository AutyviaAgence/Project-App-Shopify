-- Migration: Add link_clicks table for detailed click tracking
-- Run this on your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES wa_links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_hash TEXT,
  referer TEXT
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks(clicked_at);

-- RLS policies
ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;

-- Users can read clicks for their own links
CREATE POLICY "Users can read own link clicks"
  ON link_clicks FOR SELECT
  USING (
    link_id IN (SELECT id FROM wa_links WHERE user_id = auth.uid())
  );

-- Users can delete clicks for their own links (for reset)
CREATE POLICY "Users can delete own link clicks"
  ON link_clicks FOR DELETE
  USING (
    link_id IN (SELECT id FROM wa_links WHERE user_id = auth.uid())
  );

-- Service role can insert (public click endpoint uses service_role)
-- No INSERT policy needed for authenticated users since clicks are inserted via service_role

-- GRANTs nécessaires pour que PostgREST puisse accéder à la table
GRANT ALL ON link_clicks TO anon;
GRANT ALL ON link_clicks TO authenticated;
GRANT ALL ON link_clicks TO service_role;
