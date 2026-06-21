-- SP-2 Migration: owners, store_links, store_requests
-- Auth: Supabase Auth (auth.users 1:1 → owners)

-- ============================================================
-- Table: owners
-- owners.id == auth.users.id (profile 1:1)
-- ============================================================
CREATE TABLE owners (
  id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              text,
  name               text,
  role               text        NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  store_link_id      uuid        NULL,  -- FK added below after store_links
  terms_agreed_at    timestamptz,
  privacy_agreed_at  timestamptz,
  marketing_consent  boolean     NOT NULL DEFAULT false,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON owners
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_self_select" ON owners
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "owner_self_update" ON owners
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============================================================
-- Table: store_links
-- ============================================================
CREATE TABLE store_links (
  id               uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid  NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  master_store_id  uuid  NOT NULL,  -- NO cross-project FK (master DB 분리)
  store_code       text  UNIQUE NOT NULL,
  store_name       text,
  address          text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE store_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON store_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON store_links
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "owner_own_insert" ON store_links
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_own_update" ON store_links
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============================================================
-- Table: store_requests
-- ============================================================
CREATE TABLE store_requests (
  id                    uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid  REFERENCES owners(id) ON DELETE SET NULL,
  requested_store_name  text,
  requested_address     text,
  status                text  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE store_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON store_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_insert" ON store_requests
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_own_select" ON store_requests
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- ============================================================
-- owners.store_link_id FK (after store_links exists)
-- ============================================================
ALTER TABLE owners
  ADD CONSTRAINT owners_store_link_id_fkey
  FOREIGN KEY (store_link_id) REFERENCES store_links(id);

-- ============================================================
-- Trigger: handle_new_owner
-- AFTER INSERT on auth.users → auto-create owners row
-- signUp passes name, terms_agreed_at, privacy_agreed_at, marketing_consent in options.data
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.owners (
    id,
    email,
    name,
    role,
    terms_agreed_at,
    privacy_agreed_at,
    marketing_consent
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'name')::text, ''),
    'owner',
    CASE
      WHEN (NEW.raw_user_meta_data->>'terms_agreed_at') IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'terms_agreed_at')::timestamptz
      ELSE NULL
    END,
    CASE
      WHEN (NEW.raw_user_meta_data->>'privacy_agreed_at') IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'privacy_agreed_at')::timestamptz
      ELSE NULL
    END,
    COALESCE((NEW.raw_user_meta_data->>'marketing_consent')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_owner();

-- ============================================================
-- schema_version bump
-- ============================================================
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '002')
ON CONFLICT (key) DO UPDATE SET value = '002';
