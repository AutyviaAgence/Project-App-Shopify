-- Migration: Link new users to their tenant on signup
-- The tenant_id is passed via user metadata from the registration form

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_tenant_id UUID;
BEGIN
  -- Try to get tenant_id from user metadata (set during registration)
  resolved_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;

  -- Fallback to default tenant if not specified
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
