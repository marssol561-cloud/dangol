-- SP-5 Migration: messages, send_channels, automation_rules
-- RLS: service_role ALL; authenticated owner sees own store_link rows; NO anon.
-- All new functions/triggers: REVOKE EXECUTE from anon, authenticated.

-- ============================================================
-- Table: messages
-- ============================================================
CREATE TABLE messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id   uuid        NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  customer_id     uuid        REFERENCES customers(id) ON DELETE SET NULL,
  channel         text        NOT NULL CHECK (channel IN ('alimtalk','sms','email')),
  template_id     text,
  content         text,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','sent','failed')),
  provider_msg_id text,
  sent_at         timestamptz,
  callback_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON messages (store_link_id, created_at);
CREATE INDEX ON messages (provider_msg_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON messages
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: send_channels
-- ============================================================
CREATE TABLE send_channels (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id    uuid        NOT NULL UNIQUE REFERENCES store_links(id) ON DELETE CASCADE,
  provider         text        NOT NULL DEFAULT 'solapi',
  kakao_channel_id text,
  sender_number    text,
  api_key_enc      text,
  setup_step       int         NOT NULL DEFAULT 0 CHECK (setup_step BETWEEN 0 AND 4),
  connected        boolean     NOT NULL DEFAULT false
);

ALTER TABLE send_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON send_channels
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON send_channels
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

CREATE POLICY "owner_own_insert" ON send_channels
  FOR INSERT TO authenticated
  WITH CHECK (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

CREATE POLICY "owner_own_update" ON send_channels
  FOR UPDATE TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  )) WITH CHECK (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- Table: automation_rules
-- ============================================================
CREATE TABLE automation_rules (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_link_id uuid    NOT NULL REFERENCES store_links(id) ON DELETE CASCADE,
  type          text    NOT NULL CHECK (type IN ('churn','anniversary')),
  enabled       boolean NOT NULL DEFAULT false,
  params        jsonb,
  template_id   text,
  UNIQUE (store_link_id, type)
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON automation_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "owner_own_select" ON automation_rules
  FOR SELECT TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

CREATE POLICY "owner_own_insert" ON automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

CREATE POLICY "owner_own_update" ON automation_rules
  FOR UPDATE TO authenticated
  USING (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  )) WITH CHECK (store_link_id IN (
    SELECT id FROM store_links WHERE owner_id = auth.uid()
  ));

-- ============================================================
-- schema_version bump
-- ============================================================
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '006')
ON CONFLICT (key) DO UPDATE SET value = '006';
