## SP-1 Infrastructure Bootstrap — 리붐단골

### 변경 요약
- Next.js 16 앱 스캐폴딩 (점주/고객/관리자 존 플레이스홀더)
- GET /api/health → 200 {status:"ok",ts:"..."}
- lib/masterDb.ts: itdalab-infra REST 읽기 전용 클라이언트 (3컬럼만 SELECT)
- lib/dangolDb.ts: dangol DB service_role/anon 클라이언트
- supabase/migrations/001_base.sql: pgcrypto, app_meta RLS ON, service_role ALL, anon 없음
- Sentry client/server config (DSN 없으면 no-op)
- vitest 테스트 4종
- .env.example, .gitignore, README, CLAUDE.md

### Supabase (dangol DB)
- Project ref: gjiueiotuyzohndixxnq (ap-northeast-2, PG17)
- Migration 001_base 적용 완료 (MCP 확인)
- app_meta: schema_version='001' 확인 / RLS ON / anon 정책 없음 확인

---

## PR 게이트 체크박스 (6세트)

### 기둥 1 — 레포·네이밍
- [x] R1 repo name kebab-case [a-z0-9-]
- [x] R2 domain/prefix rule (dangol = 제품명)
- [x] R3 로컬 폴더명 = 레포명 = 배포명
- [x] R4 기본 브랜치 = main
- [x] R5 GitHub remote 등록

### 기둥 2 — 폴더 구조
- [x] D1 Products\dangol\ 위치
- [x] D2 2.4 앱 스캐폴딩 준수
- [x] D3 .env가 .gitignore에 등록
- [x] D4 _pending/_archive 임시 폴더 없음
- [x] D5 시크릿 파일 레포 루트 외 없음

### 기둥 3 — 배포
- [x] B1 플랫폼 = Vercel / Supabase
- [x] B2 prod 브랜치 = main only (본 PR은 preview만)
- [x] B3 CEO 승인 전 prod 없음
- [ ] B4 /api/health Vercel preview 200 확인 (CEO 프리뷰 URL 확인 후 체크)
- [x] B5 .env.example 루트 존재, 실값은 대시보드에만

### 기둥 4 — DB 연결
- [x] M1 점포 fact → master, 제품 데이터 → dangol
- [x] M2 마스터 참조 = store_id/visit_id UUID
- [x] M3 cross-project = UUID + 앱 검증 (REST only)
- [x] M4 모든 신규 테이블 RLS ON (app_meta: service_role ALL, anon 없음)
- [x] M5 env 이름 MASTER_DB_* / DANGOL_DB_*
- [x] M6 위성 테이블 없음 (SP-1 범위)
- [x] M7 마스터DB 원칙 준수 (REST 읽기 전용, 3컬럼 SELECT, 쓰기 없음)

### 기둥 5 — 하네스 블록
- [x] V1 진입 칼럼 = store_id/visit_id UUID
- [x] V2 cross-project = UUID+앱 검증
- [x] V3 가짜 place_id 없음
- [x] V4 campaign_id 신규 사용 없음

### 기둥 6 — 시크릿·환경변수
- [x] E1 env 키 = {대상}_{용도} 패턴
- [x] E2 표준 키명 카탈로그 준수
- [x] E3 .env.example 코드 참조 KEY 전체 일치
- [x] E4 .gitignore에 .env / *.key / service-account*.json 포함
- [x] E5 PR 본문에 시크릿 평문 없음
- [x] E6 실값은 .env.local / 대시보드에만

---

CEO 머지 전 확인 사항:
1. Vercel dangol 프로젝트 env vars 설정 (DANGOL_DB_SERVICE_ROLE_KEY 등)
2. 프리뷰 URL에서 /api/health 200 확인 후 B4 체크
3. 로컬: .env.local service_role 키 입력 후 npm test 실행 (4/4 통과 확인)
