# dangol (리붐단골)

리붐 생태계의 단골 고객 관리 제품.

## 프로젝트 구조

```
dangol/
├── app/
│   ├── layout.tsx          # 공통 레이아웃
│   ├── page.tsx            # 점주 존 (/)
│   ├── r/[code]/page.tsx   # 고객 QR 존 (/r/:code)
│   ├── admin/page.tsx      # 관리자 존 (/admin)
│   └── api/health/route.ts # 헬스체크 (/api/health)
├── lib/
│   ├── masterDb.ts         # 마스터 DB REST 클라이언트 (읽기 전용)
│   └── dangolDb.ts         # dangol DB Supabase 클라이언트
├── supabase/
│   ├── migrations/         # DDL/RLS 마이그레이션
│   └── seed/               # 초기 시드
├── tests/                  # vitest 테스트
├── docs/                   # 기획·PRD 문서
├── sentry.client.config.ts # Sentry 클라이언트
├── sentry.server.config.ts # Sentry 서버
└── .env.example            # 환경변수 목록 (값 없음)
```

## 로컬 실행

```bash
# 의존성 설치
npm install

# 환경변수 설정 (.env.example 참고)
cp .env.example .env.local
# .env.local에 실제 값 입력

# 개발 서버
npm run dev

# 테스트
npm test
```

## 환경변수

`.env.example` 참고. 실제 값은 Vercel 대시보드 또는 로컬 `.env.local`에만 보관.

## DB

- **마스터 DB** (`itdalab-infra`): 점포 fact 읽기 전용 REST 접근
- **dangol DB**: 단골 운영 데이터. 마이그레이션은 `supabase/migrations/` 관리

## 배포

- **플랫폼**: Vercel (프리뷰) → `main` 머지 후 prod (CEO 승인 필요)
- **헬스체크**: `GET /api/health` → 200 `{"status":"ok"}`
