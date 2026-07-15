## 요약

SP-E3 — 고객 이벤트 참여 (ReBoom Dangol / 리붐단골). SP-E1(이벤트 인프라)+SP-E2(점주 A10 관리 화면) 위에, 매장 QR로 진입한 고객이 활성 이벤트에 참여 신청(B1→B2→B3)할 수 있게 함. 참여는 항상 `pending`(직원 승인 대기)이며 **본 스프린트에서는 쿠폰을 발급하지 않음**(발급 = 직원 승인, SP-E4).

**구현 범위:**
- `lib/events.ts`(MOD, 기존 함수 전부 무변경) — `createParticipation`(활성 이벤트 확인 → 고객 upsert(기존 `app/api/customers/route.ts` dedupe 패턴 재사용) → 개인정보+제3자 양대 필수 동의 검증 → `event_participations` idempotent insert, 쿠폰 미발급), `getParticipationStatus`, `listUpcomingPreannounce`
- `app/api/r/[code]/event-join/route.ts` / `app/api/r/[code]/event-status/route.ts` — 422(no_active_event/consent_required/thirdparty_required), 성공 시 기존과 동일한 `dangol_bt` httpOnly 쿠키 발급
- `app/r/[code]/page.tsx` — 평시 상태 머신·전이 로직 무변경, Event B1(이벤트 소개+참여 CTA)/B2(정보+동의)/B3(승인 대기→쿠폰 표시, 다가오는 이벤트 배너)를 **오버레이 게이트**로 앞단에 추가

**검증:** 신규 테스트 3종 11개 + 기존 스위트 전체 = **53 test files / 224 tests 통과**. `npx eslint tests/ lib/events.ts app/api/r/` 0 errors. `npx tsc --noEmit` 클린. `git status --short`로 변경 범위가 FILE STRUCTURE와 일치함을 확인(DB 스키마·마이그레이션·스태프 화면·평시 `/api/customers` 무변경).

세션로그: `System/SessionLogs/itda2_SP-E3_2026-07-15.md`

**판단사항(설계 여백을 코드로 직접 해결):**
1. `event-status`의 `browser_token`은 쿼리 파라미터 지원을 유지하되, 미지정 시 서버가 `/api/checkin`과 동일하게 httpOnly `dangol_bt` 쿠키를 직접 읽음 — 클라이언트 JS는 해당 쿠키 값을 읽을 수 없어(`httpOnly: true`, `app/api/customers/route.ts` 8단계) 쿼리 파라미터만으로는 재방문 분기가 성립하지 않음
2. `getParticipationStatus`는 "활성 이벤트의 참여"가 아니라 "매장 내 고객의 최신 참여"를 조회 — `issue_cap` 도달로 승인 자체가 이벤트를 `closed`로 전환시키는 경우, 활성 이벤트 기준 조회는 승인 직후 정확히 그 순간 폴링이 실패하는 결함이 있어 이를 방지
3. `app/r/[code]/page.tsx`는 평시 상태 머신을 건드리지 않는 오버레이 게이트 패턴으로 구현 — `activeEvent`/`eventGateDismissed`/`eventJoinStep` 신규 상태만 추가, 기존 `step` 전이·렌더링은 초기 `useEffect`의 4줄 삽입(이벤트 감지) 외 무변경

---

## PR 체크박스 (제품조립매뉴얼 v1.3)

### R1~R5 (레포·네이밍)
```
[x] R1~R5. N/A — 신규 레포 생성 없음, 로컬 폴더=레포명=배포명·기본 브랜치·remote 전부 기존 유지(기존 dangol 레포)
```

### D1~D5 (폴더 구조)
```
[x] D1. Products\dangol\ 하위, 기존 app/, app/api/, lib/, tests/ 골격 그대로
[x] D2. app/api/r/[code]/event-join, event-status 모두 기존 app-skeleton 규칙 내부
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
[x] M1~M7. N/A — 신규 테이블/마이그레이션 없음(SP-E1이 스키마 소유). 위성 진입 칼럼·FK·환경변수·마스터DB 무관, RLS 무변경. 고객 upsert는 기존 `app/api/customers/route.ts`와 동일한 dedupe 패턴 재사용
```

### V1~V4 (하네스 블록 공유)
```
[x] V1~V4. N/A — 위성 테이블 신설 없음, place_id/campaign_id 무관
```

### E1~E6 (시크릿·환경변수)
```
[x] E1~E4, E6. N/A — env 키·`.env.example`·`.gitignore`·실값 위치 변경 없음(`DANGOL_ENCRYPTION_SECRET`·`DANGOL_HASH_SECRET` 등 기존 그대로 재사용)
[x] E5. PR 본문·코드·로그에 시크릿 평문 없음 확인
```

---

## 수정/신규 파일
MOD: `lib/events.ts`, `app/r/[code]/page.tsx`
NEW: `app/api/r/[code]/event-join/route.ts`, `app/api/r/[code]/event-status/route.ts`, `tests/events_join.test.ts`, `tests/events_participation_status.test.ts`, `tests/events_returning_branch.test.ts`
