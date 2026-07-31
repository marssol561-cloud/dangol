# dangol 레포 에이전트 지침

이 레포에서 작업하는 에이전트는 다음 전사 매뉴얼을 반드시 정독한다:
- 제품 조립 매뉴얼 정본 — `C:\ITDALab\Management\Manuals\` 내 마스터파일인덱스(`INDEX.md`)로 현재 파일을 확인한다. 파일명·버전 하드코딩 금지.

## 핵심 규칙

- 마스터 DB (`itdalab-infra`): **읽기 전용** — `lib/masterDb.ts` 통해서만 접근, 쓰기 금지
- dangol DB: 모든 신규 테이블 RLS ON + service_role ALL + **anon SELECT 없음**
- 마이그레이션은 `supabase/migrations/NNN_*.sql` 파일로만 변경, 대시보드 직접 실행 금지
- `getServerClient()` — 서버 전용, 클라이언트 컴포넌트 import 금지
- 깃 푸시 / main 머지 / 프로덕션 배포 = CEO 승인 필수
