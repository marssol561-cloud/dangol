-- SP-1 Base Migration
-- dangol 운영 DB 기초 설정

-- UUID 생성 확장
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- RLS 정책 표준 템플릿 (SP-2+ 신규 테이블 복사·붙여넣기용)
-- ============================================================
--
-- ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--
-- -- Policy A: service_role 전체 권한
-- CREATE POLICY "service_role_all" ON <t>
--   FOR ALL
--   TO service_role
--   USING (true)
--   WITH CHECK (true);
--
-- -- Policy B: authenticated owner/staff — 자기 점포 행만 접근
-- CREATE POLICY "owner_own_store" ON <t>
--   FOR ALL
--   TO authenticated
--   USING (store_link_id = (SELECT store_link_id FROM store_members WHERE user_id = auth.uid() LIMIT 1))
--   WITH CHECK (store_link_id = (SELECT store_link_id FROM store_members WHERE user_id = auth.uid() LIMIT 1));
--
-- ⚠️  anon SELECT 정책 없음 (개인 데이터 — master DB anon-SELECT 기본값 오버라이드)
-- ============================================================

-- app_meta: 스키마 버전 및 앱 메타데이터 관리 테이블
CREATE TABLE IF NOT EXISTS app_meta (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text        UNIQUE NOT NULL,
  value      text,
  created_at timestamptz DEFAULT now()
);

-- RLS 활성화
ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;

-- Policy A: service_role 전체 권한
CREATE POLICY "service_role_all" ON app_meta
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- anon 정책 없음 — anon은 app_meta에 접근 불가

-- 초기 시드: 스키마 버전 등록
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '001')
ON CONFLICT (key) DO NOTHING;
