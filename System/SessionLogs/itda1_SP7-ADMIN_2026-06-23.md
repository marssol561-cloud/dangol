# itda1 세션로그 — SP-7 ReBoom Super-Admin

날짜: 2026-06-23  
브랜치: feat/sp7-admin  
PR: https://github.com/marssol561-cloud/dangol/pull/7

## 완료 항목

- [x] supabase/migrations/008_admins_unified_audit.sql — 원격 DB 적용 완료
- [x] lib/admin.ts — isAdmin() / requireAdmin()
- [x] lib/unified.ts — linkUnifiedIfConsented()
- [x] app/api/customers/route.ts — 신규 고객 생성 시 linkUnifiedIfConsented 호출
- [x] middleware.ts — /admin/* + /api/admin/* 404 게이트, matcher 수정
- [x] app/admin/page.tsx — C1 대시보드 (KPI 5종)
- [x] app/admin/stores/page.tsx — C2 매장 목록 + 고객수/발송수
- [x] app/admin/customers/page.tsx — C3 통합 고객 + CSV 내보내기
- [x] app/admin/messages/page.tsx — C4 채널별 발송 현황
- [x] app/admin/consents/page.tsx — C5 동의 통계
- [x] app/admin/system/page.tsx — C6 시스템 정보 + 감사로그
- [x] app/admin/channels/page.tsx — C7 채널 모니터링 (support 대상 강조)
- [x] app/api/admin/dashboard|stores|customers|customers/export|messages|consents|system|channels — 8개 라우트
- [x] tests/adminGate.test.ts — 통과
- [x] tests/unifiedLink.test.ts — 통과
- [x] tests/unifiedDedupe.test.ts — 통과
- [x] tests/adminAgg.test.ts — 통과
- [x] tests/exportAudit.test.ts — 통과
- [x] tests/rls_admin.test.ts — 통과
- [x] TypeScript --noEmit 오류 0건
- [x] schema_version = 008
- [x] PR #7 오픈

## SP-7 Merge 완료 (2026-06-23)

- Preview: READY (`dpl_63CiVuFJc2AMnCE4bDbPbYw9AZs4`)
- 머지 커밋: `55d3035` (PR #7 → main)
- feat/sp7-admin 원격 브랜치 삭제 완료
- 프로덕션: READY (`dpl_7JmZ9b4nNxgddsncEp4XZ1ree633`)
- /api/health: 200 `{"status":"ok"}`

## 미완료 / 후속 필요

- CEO admin seed: itdalabbot@gmail.com이 dangol auth.users 미존재 → CEO가 앱 가입 후 아래 SQL 1회 실행
  ```sql
  INSERT INTO admins (id, name)
  SELECT id, 'CEO' FROM auth.users WHERE email = 'itdalabbot@gmail.com'
  ON CONFLICT (id) DO NOTHING;
  ```

## SP-8 완료 (2026-06-23)

- 브랜치: feat/sp8-safety-legal / 커밋: b447b22
- PR: https://github.com/marssol561-cloud/dangol/pull/8
- 테스트: 6파일 30/30 통과 | tsc: 0건 | security advisor: 0

완료 목록:
- [x] 009 migration (deleted_at, unsub_token, consent_versions, consents.version)
- [x] lib/purge.ts — anonymizeCustomer + scanPurgeTargets
- [x] lib/unsubscribe.ts — resolveByToken + optOut + withdrawConsent
- [x] lib/sendGuard.ts — filterNonDeleted
- [x] lib/segments.ts — unsub_token + deleted_at 필터
- [x] lib/messaging.ts — unsub 링크 + filterNonDeleted
- [x] app/unsubscribe/page.tsx (B4)
- [x] app/api/unsubscribe / consent-versions / cron/purge
- [x] vercel.json — purge cron 02:00 UTC

후속 필요:
- Lawyer 검토 후 consent_versions DRAFT 문구 제거
- Vercel NEXT_PUBLIC_APP_URL 설정 (unsubscribe 링크 완전 동작)
- CEO admin seed SQL (itdalabbot@gmail.com 가입 후)
