-- SP-4 Migration: visits, stamps_rewards, referrals
-- RLS: service_role ALL; authenticated owner sees own store_link rows; NO anon.

-- ============================================================
-- Table: visits
-- ============================================================
CREATE TABLE visits (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_link_id  uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  visited_at     timestamptz NOT NULL DEFAULT now(),
  stamp_delta    int         NOT NULL DEFAULT 1,
  source         text        NOT NULL DEFAULT 'checkin' CHECK (source IN ('checkin'))
);

CREATE INDEX ON visits (customer_id, visited_at);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON visits
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON visits
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: stamps_rewards
-- ============================================================
CREATE TABLE stamps_rewards (
  id             uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id  uuid  NOT NULL UNIQUE REFERENCES store_links(id) ON DELETE CASCADE,
  required_count int   NOT NULL DEFAULT 10,
  reward_desc    text,
  service_a      text,
  service_b      text,
  service_c      text
);

ALTER TABLE stamps_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON stamps_rewards
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON stamps_rewards
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

CREATE POLICY "owner_own_insert" ON stamps_rewards
  FOR INSERT TO authenticated
  WITH CHECK (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

CREATE POLICY "owner_own_update" ON stamps_rewards
  FOR UPDATE TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  )) WITH CHECK (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: referrals
-- ============================================================
CREATE TABLE referrals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id  uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  referrer_id    uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invitee_id     uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  reward_given   boolean     NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON referrals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON referrals
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- schema_version bump
-- ============================================================
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '005')
ON CONFLICT (key) DO UPDATE SET value = '005';
