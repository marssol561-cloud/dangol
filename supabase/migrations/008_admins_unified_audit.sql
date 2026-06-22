-- 008: admins, unified_customers, audit_logs + customers.unified_id
-- Security: service_role ALL only. NO owner/anon policy on any of the 3 tables.
-- Contact plaintext NEVER stored here (hash + stats only).

-- ============================================================
-- Table: admins (whitelist of ReBoom internal admins)
-- ============================================================
CREATE TABLE admins (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON admins
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Table: unified_customers (cross-store dedup — consent-gated)
-- ============================================================
CREATE TABLE unified_customers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash text        UNIQUE NOT NULL,
  channels        jsonb,
  store_count     int         NOT NULL DEFAULT 0,
  first_seen_at   timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE unified_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON unified_customers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- customers.unified_id FK
-- ============================================================
ALTER TABLE customers
  ADD COLUMN unified_id uuid REFERENCES unified_customers(id) ON DELETE SET NULL;

CREATE INDEX ON customers (unified_id);

-- ============================================================
-- Table: audit_logs (admin actions, e.g. export)
-- ============================================================
CREATE TABLE audit_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user uuid,
  action     text,
  target     text,
  count      int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON audit_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Backfill: existing thirdparty-consented customers → unified
-- ============================================================
DO $$
DECLARE
  rec    RECORD;
  uni_id uuid;
  idhash text;
BEGIN
  FOR rec IN
    SELECT DISTINCT c.id, c.phone_hash, c.kakao_hash, c.email_hash
    FROM   customers c
    INNER  JOIN consents cn ON cn.customer_id = c.id
    WHERE  cn.type = 'thirdparty'
      AND  cn.agreed = true
      AND  c.unified_id IS NULL
  LOOP
    idhash := COALESCE(rec.phone_hash, rec.kakao_hash, rec.email_hash);
    CONTINUE WHEN idhash IS NULL;

    INSERT INTO unified_customers (identifier_hash, store_count)
    VALUES (idhash, 1)
    ON CONFLICT (identifier_hash)
      DO UPDATE SET store_count = unified_customers.store_count + 1
    RETURNING id INTO uni_id;

    UPDATE customers SET unified_id = uni_id WHERE id = rec.id;
  END LOOP;
END $$;

-- ============================================================
-- Seed first admin: CEO (itdalabbot@gmail.com)
-- ============================================================
DO $$
DECLARE
  ceo_id uuid;
BEGIN
  SELECT id INTO ceo_id FROM auth.users WHERE email = 'itdalabbot@gmail.com';
  IF ceo_id IS NOT NULL THEN
    INSERT INTO admins (id, name)
    VALUES (ceo_id, 'CEO')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- schema_version bump
-- ============================================================
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '008')
ON CONFLICT (key) DO UPDATE SET value = '008';
