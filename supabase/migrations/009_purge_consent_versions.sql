-- 009: customers.deleted_at + unsub_token; consent_versions (anon SELECT); consents.version
-- Retention period (2y) is LAWYER-PENDING §11 — kept as a named constant, not hardcoded policy.
-- Purge = ANONYMIZE (null contacts, keep visit stats, detach unified). NOT row deletion.

-- ============================================================
-- customers: deleted_at + unsub_token
-- ============================================================
ALTER TABLE customers
  ADD COLUMN deleted_at  timestamptz,
  ADD COLUMN unsub_token text;

-- Backfill unsub_token for all existing rows
UPDATE customers
  SET unsub_token = encode(gen_random_bytes(16), 'hex')
  WHERE unsub_token IS NULL;

ALTER TABLE customers
  ALTER COLUMN unsub_token SET NOT NULL,
  ADD CONSTRAINT customers_unsub_token_unique UNIQUE (unsub_token);

-- Index for fast token lookups
CREATE INDEX ON customers (unsub_token);

-- Index for purge scan: find non-deleted stale rows
CREATE INDEX ON customers (last_visit_at) WHERE deleted_at IS NULL;

-- ============================================================
-- Table: consent_versions (public-safe — anon SELECT allowed)
-- ============================================================
CREATE TABLE consent_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text        NOT NULL
                             CHECK (type IN ('required','thirdparty','ad','terms','privacy')),
  version      int         NOT NULL,
  content      text        NOT NULL,
  effective_at timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (type, version)
);

ALTER TABLE consent_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON consent_versions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Anon SELECT: consent text is public-safe (NOT personal data)
CREATE POLICY "anon_select" ON consent_versions
  FOR SELECT TO anon
  USING (true);

-- ============================================================
-- consents: version column (which text version was agreed)
-- ============================================================
ALTER TABLE consents
  ADD COLUMN version int;

-- ============================================================
-- Seed consent_versions v1 (DRAFT — lawyer-pending §11)
-- ============================================================
INSERT INTO consent_versions (type, version, content) VALUES
  ('required',   1,
   '[DRAFT — lawyer-pending §11] 본 서비스 이용을 위한 개인정보(연락처) 수집·이용에 동의합니다. 수집 항목: 연락처. 이용 목적: 고객 관리 및 재방문 혜택 제공. 보유 기간: 마지막 방문 후 2년 또는 동의 철회 시까지.'),
  ('thirdparty', 1,
   '[DRAFT — lawyer-pending §11] 제3자(잇다랩)에게 고객 정보를 제공하는 것에 동의합니다. 목적: 멀티 매장 서비스 개선. 정보: 식별 해시값(연락처 원문 미포함). 보유: 동의 철회 시 즉시 삭제.'),
  ('ad',         1,
   '[DRAFT — lawyer-pending §11] 광고성 정보 수신에 동의합니다. 수신 채널: SMS/카카오/이메일 중 동의한 채널. 거부 방법: 수신 메시지 내 수신거부 링크 또는 매장 직접 요청.'),
  ('terms',      1,
   '[DRAFT — lawyer-pending §11] 잇다랩 서비스 이용약관에 동의합니다.'),
  ('privacy',    1,
   '[DRAFT — lawyer-pending §11] 개인정보 처리방침에 동의합니다.');

-- ============================================================
-- schema_version bump
-- ============================================================
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '009')
ON CONFLICT (key) DO UPDATE SET value = '009';
