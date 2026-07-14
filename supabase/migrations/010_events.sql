-- SP-E1 Migration: events, event_participations, customer_tags + coupons.event_id
-- Event infra blocker for SP-E2..E6. No UI, no announcement sending in this sprint.
-- RLS: service_role ALL; authenticated owner sees own store_link rows; NO anon.

-- ============================================================
-- Table: events
-- ============================================================
CREATE TABLE events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id      uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  type               text        NOT NULL CHECK (type IN ('onsite','preannounce')),
  title              text        NOT NULL,
  description        text,
  condition          text,
  reward_coupon_kind text,
  reward_benefit     text,
  start_at           timestamptz,
  end_at             timestamptz,
  issue_cap          int,
  coupon_valid_days  int         DEFAULT 14,
  target_segment     jsonb,
  status             text        NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','closed','ended')),
  created_by         uuid        REFERENCES owners(id),
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX ON events (store_link_id, status);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON events
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: event_participations
-- ============================================================
CREATE TABLE event_participations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id      uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_link_id    uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','expired','cancelled')),
  condition_answer text,
  approved_by      uuid        REFERENCES owners(id),
  approved_at      timestamptz,
  tag              text,
  coupon_id        uuid        REFERENCES coupons(id),
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT uq_event_customer UNIQUE (event_id, customer_id)
);

CREATE INDEX ON event_participations (event_id);
CREATE INDEX ON event_participations (store_link_id);

ALTER TABLE event_participations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON event_participations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON event_participations
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: customer_tags
-- ============================================================
CREATE TABLE customer_tags (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_link_id   uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  tag             text        NOT NULL,
  source_event_id uuid        REFERENCES events(id) ON DELETE SET NULL,
  created_by      uuid        REFERENCES owners(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON customer_tags (customer_id);
CREATE INDEX ON customer_tags (store_link_id, tag);

ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON customer_tags
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON customer_tags
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- coupons: link to originating event (nullable — most coupons are not event coupons)
-- ============================================================
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX ON coupons (event_id);

-- ============================================================
-- schema_version bump
-- ============================================================
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '010')
ON CONFLICT (key) DO UPDATE SET value = '010';
