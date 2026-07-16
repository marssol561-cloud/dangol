## 요약

SP-E4 — Staff win-approval + coupon exchange (A5) (ReBoom Dangol / 리붐단골). SP-E1(이벤트 인프라)+SP-E2(점주 A10 관리)+SP-E3(고객 참여) 위에, 직원이 매장의 오늘자 `pending` 이벤트 참여를 승인/취소할 수 있게 함. 승인 시 감사기록(승인자+시각) 저장, 이벤트 `condition`을 고객 태그(`customer_tags`)로 분리 저장, 이벤트 연동 쿠폰(`coupons.event_id`) 발급+발송+참여 연결까지 원자적으로 처리(멱등). 기존 쿠폰 사용(exchange) 플로우는 무변경.

**구현 범위:**
- `lib/coupons.ts`(MOD, 기존 함수 전부 무변경) — `issueEventCoupon(db, {...})` 추가, `kind='custom'`(SP-E1이 이미 CHECK에 포함한 값) + `event_id` 연결, 기존 코드 충돌 재시도 패턴 재사용
- `lib/events.ts`(MOD, 기존 함수 전부 무변경) — `listPendingApprovals`(오늘(KST) 생성분만, 고객 마스킹 라벨), `approveParticipation`(감사+자동태그+쿠폰발급+발송+연결, 동시성 가드로 멱등), `cancelParticipation`
- `app/api/events/{pending,approve,cancel}/route.ts`(NEW) — `getOwnerContext()` + role∈{owner,staff} 401, `not_pending`→409 / `not_found`→404
- `app/coupon-use/page.tsx`(MOD) — "이벤트 승인 대기" 섹션(10초 폴링 + 승인/취소 + 토스트) 추가, 기존 쿠폰 교환 폼 무변경

**검증:** 신규 테스트 2종 10개 + 기존 스위트 전체 = **55 test files / 234 tests** 중 233 통과, 무관 플레이키 1건(`tests/storeSearch.test.ts` — 마스터DB 조회 statement timeout, 단독 실행 시 항상 통과, main 베이스라인에도 존재하는 리소스 경합, 본 PR 코드 무관). `npx tsc --noEmit` 클린. `npx eslint .`(전체) — main 대비 **+1 error**(`app/coupon-use/page.tsx`, `react-hooks/set-state-in-effect` — 본 레포에 이미 존재하는 동일 패턴 `app/events/page.tsx`·`app/settings/StaffSection.tsx`·`app/unsubscribe/page.tsx` 3곳과 100% 동일, 신규 warning 0). `git status --short`로 변경 범위가 FILE STRUCTURE와 일치함을 확인.

세션로그: `System/SessionLogs/itda5_SP-E4_2026-07-16.md`

**판단사항(설계 여백을 코드로 직접 해결):**
1. `issueEventCoupon`은 지시서 시그니처(`issueEventCoupon(db, {...})`)대로 `db`를 인자로 받는 별도 함수로 신설 — 기존 `insertCoupon`(내부에서 `getServerClient()` 직접 호출)은 무변경, `lib/events.ts`(SP-E1~E3)의 기존 db-인자 관례를 따름
2. `approveParticipation`은 `UPDATE ... WHERE status='pending'` 원자적 가드 + 영향 행 0건 시 1회 재귀 재실행으로 동시 승인 클릭 경쟁 상황에서도 쿠폰 2중 발급을 방지
3. cross-store 접근은 `getEventDetail`/`updateEvent`의 기존 규약과 동일하게 `not_found`로 매핑(라우트 404), `not_pending`(409)과 구분
4. "오늘"은 KST(UTC+9) 자정 기준으로 판정(서버 배포 리전 UTC에 비의존)
5. 공용 Toast 컴포넌트가 레포에 없어 신설하지 않고, 기존 `result` 배너와 동일한 로컬 상태+자동소멸 인라인 배너로 구현(파일 범위 유지)

---

## PR 체크박스 (제품조립매뉴얼 v1.4)

### R1~R5 (레포·네이밍)
```
[x] R1~R5. N/A — 신규 레포 생성 없음, 로컬 폴더=레포명=배포명·기본 브랜치·remote 전부 기존 유지(기존 dangol 레포)
```

### D1~D5 (폴더 구조)
```
[x] D1. Products\dangol\ 하위, 기존 app/, app/api/, lib/, tests/ 골격 그대로
[x] D2. app/api/events/{pending,approve,cancel} 모두 기존 app-skeleton 규칙 내부
[x] D3. .env 본 PR 무변경
[x] D4. 임시 폴더 신설 없음
[x] D5. 시크릿 파일 신설·이동 없음
```

### B1~B5 (배포)
```
[x] B1~B2, B4~B5. N/A — 배포 플랫폼·브랜치·헬스체크·env 변경 없음
[ ] B3. CEO 승인 전 — 본 PR은 아직 push/merge되지 않음(PROHIBITED 조항 준수). CEO 승인 후 머지 시점에 체크
```

### M1~M7 (DB 연결)
```
[x] M1~M7. N/A — 신규 테이블/마이그레이션 없음(SP-E1이 스키마 소유, `coupons.kind='custom'`은 이미 존재하는 CHECK 값). 위성 진입 칼럼·FK·환경변수·마스터DB 무관, RLS 무변경, 신규 테이블 없음
```

### V1~V4 (하네스 블록 공유)
```
[x] V1~V4. N/A — 위성 테이블 신설 없음, place_id/campaign_id 무관
```

### E1~E6 (시크릿·환경변수)
```
[x] E1~E4, E6. N/A — env 키·`.env.example`·`.gitignore`·실값 위치 변경 없음
[x] E5. PR 본문·코드·로그에 시크릿 평문 없음 확인
```

---

## 수정/신규 파일
MOD: `lib/coupons.ts`, `lib/events.ts`, `app/coupon-use/page.tsx`
NEW: `app/api/events/pending/route.ts`, `app/api/events/approve/route.ts`, `app/api/events/cancel/route.ts`, `tests/events_approve.test.ts`, `tests/events_cancel_expire.test.ts`

## 지시자 판단 요청 (머지 전 확인 필요)
1. 로컬 전용 브랜치 `feat/spe4-staff-approval-itda2-prior`(itda2의 선행 동일 스프린트 작업물, 커밋 `aeb8444`) 처리 방침
2. `react-hooks/set-state-in-effect` 기존 관례 4곳(본 PR 포함 시) 정리 스프린트 필요 여부
