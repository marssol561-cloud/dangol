-- SP-3 Migration: customers, consents, coupons
-- Contact: stored as *_hash (HMAC-SHA256) + *_enc (AES-256-GCM). NO plaintext.
-- RLS: service_role ALL; authenticated owner sees own store_link rows only; NO anon policy.

-- ============================================================
-- Table: customers
-- ============================================================
CREATE TABLE customers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id  uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  phone_enc      text,
  phone_hash     text,
  kakao_enc      text,
  kakao_hash     text,
  email_enc      text,
  email_hash     text,
  name           text        NULL,
  grade          text        NOT NULL DEFAULT 'normal' CHECK (grade IN ('vip','regular','normal')),
  visit_count    int         NOT NULL DEFAULT 0,
  last_visit_at  timestamptz,
  visit_purpose  text,
  companion      text,
  browser_token  text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX ON customers (store_link_id, phone_hash);
CREATE INDEX ON customers (store_link_id, kakao_hash);
CREATE INDEX ON customers (store_link_id, email_hash);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON customers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON customers
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: consents
-- ============================================================
CREATE TABLE consents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_link_id  uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  type           text        NOT NULL CHECK (type IN ('required','thirdparty','ad_sms','ad_kakao','ad_email')),
  agreed         boolean     NOT NULL,
  agreed_at      timestamptz,
  revoked_at     timestamptz
);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON consents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON consents
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: coupons
-- ============================================================
CREATE TABLE coupons (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id  uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  customer_id    uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind           text        NOT NULL CHECK (kind IN ('A','B','C','custom')),
  code           text        UNIQUE NOT NULL,
  benefit        text,
  status         text        NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','used','expired')),
  issued_at      timestamptz DEFAULT now(),
  used_at        timestamptz,
  expires_at     timestamptz
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON coupons
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON coupons
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- schema_version bump
-- ============================================================
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '004')
ON CONFLICT (key) DO UPDATE SET value = '004';
