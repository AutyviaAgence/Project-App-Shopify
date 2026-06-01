-- Migration: Multi-tenant / White-label system
-- Adds tenants table and links profiles to tenants

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  domain TEXT UNIQUE,
  app_name TEXT NOT NULL DEFAULT 'Autyvia',
  logo_url TEXT DEFAULT '/logo.svg',
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#7DC2A5',
  accent_color TEXT DEFAULT '#40E9BE',
  sidebar_color TEXT DEFAULT '#2D3E48',
  support_email TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Insert default tenant (Autyvia)
INSERT INTO tenants (slug, app_name, is_default, domain)
VALUES ('autyvia', 'Autyvia', true, 'app.autyvia.fr')
ON CONFLICT (slug) DO NOTHING;

-- 3. Add tenant_id to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- 4. Link existing profiles to default tenant
UPDATE profiles SET tenant_id = (SELECT id FROM tenants WHERE is_default = true)
WHERE tenant_id IS NULL;

-- 5. Index for fast domain lookup
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL;

-- 6. Allow public read on tenants (needed for middleware resolution)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on tenants"
  ON tenants FOR SELECT
  USING (true);

CREATE POLICY "Only service role can modify tenants"
  ON tenants FOR ALL
  USING (auth.role() = 'service_role');
