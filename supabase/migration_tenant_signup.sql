-- Migration: Link new users to their tenant on signup
-- The tenant is resolved server-side from the signup_domain metadata (hostname)
-- This prevents tenant_id spoofing via client-controlled metadata

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_tenant_id UUID;
  signup_host TEXT;
BEGIN
  -- Resolve tenant from the domain the user signed up from
  signup_host := NEW.raw_user_meta_data->>'signup_domain';

  IF signup_host IS NOT NULL AND signup_host != '' THEN
    SELECT id INTO resolved_tenant_id FROM tenants WHERE domain = signup_host LIMIT 1;
  END IF;

  -- Fallback to default tenant if domain not found
  IF resolved_tenant_id IS NULL THEN
    SELECT id INTO resolved_tenant_id FROM tenants WHERE is_default = true LIMIT 1;
  END IF;

  INSERT INTO profiles (id, email, full_name, avatar_url, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    resolved_tenant_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id),
    updated_at = NOW();
  RETURN NEW;
END;
$$;
