## 요약

SP-E2 — A10 이벤트 관리 화면 (ReBoom Dangol / 리붐단골). SP-E1(이벤트 인프라: `events`/`event_participations`/`customer_tags` + `coupons.event_id`) 위에, 점주가 한 화면에서 이벤트를 생성/수정/조회하고 참여자·성과 카운터를 보고 예고형 이벤트를 발송할 수 있게 함.

**구현 범위:**
- `lib/events.ts`(MOD, `resolveStoreEvent` 무변경) — `deriveStatus`(시간/한도 기반 상태 자동 도출), `listStoreEvents`, `getEventDetail`(참여자+카운터), `validateEventInput`/`createEvent`/`updateEvent`(검증: `period_inverted`/`cap_zero`/`reward_missing`), `PREANNOUNCE_UNIT_PRICE_KRW`([CONFIG] 네임드 상수), `estimateAudience`, `previewAnnounce`/`sendAnnounce`(기존 `sendToSegment`+`isNightBlocked` 그대로 재사용)
- `app/api/events/route.ts` / `app/api/events/[id]/route.ts` / `app/api/events/[id]/announce/route.ts` — 전부 `getOwnerContext()` 소유자 게이트, 소유권 불일치 시 404/403
- `app/events/page.tsx` — A10 화면: 상태 탭 목록, 생성/수정 폼(태그 6종+자유입력 조건, 리워드, 기간, 발급한도), 상세(참여자 표+4개 카운터), 예고형 전용 발송 패널(미리보기→발송 2단계)
- `app/components/AppHeader.tsx` — owner nav에 "이벤트" 1줄 추가(아래 참고)

**검증:** 신규 테스트 3종 22개 + 기존 스위트 전체 = **50 test files / 213 tests 통과**. `npx eslint tests/ lib/events.ts app/api/events/` 0 errors. `npx tsc --noEmit` 클린. `git diff --stat`으로 변경 범위가 FILE STRUCTURE와 일치함을 확인(DB 스키마·마이그레이션·고객/스태프 화면 무변경).

세션로그: `System/SessionLogs/itda2_SP-E2_2026-07-15.md`

**판단사항(설계 여백을 코드로 직접 해결):**
1. `deriveStatus`의 `'ended'` — 저장값이 이미 `'ended'`면 보존, 그 외엔 시간/한도로 순수 도출(지시서가 3분기만 명시, 4번째 반환값 처리를 코드로 보충)
2. CRUD/announce 검증 로직을 라우트가 아닌 `lib/events.ts`로 추출 — `getOwnerContext()`가 쿠키 세션 의존이라 vitest(`environment:"node"`)에서 라우트 직접 호출 테스트 불가. 기존 관례(`getCustomersList`/`tests/customersList.test.ts`)를 따라 라우트를 얇게, 로직을 lib에 둬 완전히 테스트 가능하게 함
3. **AppHeader.tsx 변경**: FILE STRUCTURE 목록엔 없었으나 DETAILED SPEC이 "이벤트" nav 항목 추가를 명시 지시. 공유 컴포넌트지만 1줄 추가(기존 5개 항목 배열에 1개 원소 삽입)뿐이라 다른 화면 로직 영향 없음 — 다만 PROHIBITED "No modifications outside the file scope"와 문언 충돌 가능성이 있어 이 판단을 명시적으로 남김. 되돌림이 필요하면 알려주시면 1줄 롤백.

---

## PR 체크박스 (제품조립매뉴얼 v1.3)

### R1~R5 (레포·네이밍)
```
[x] R1. N/A — 신규 레포 생성 없음(기존 dangol 레포)
[x] R2. N/A — 신규 레포 생성 없음
[x] R3. N/A — 로컬 폴더명=레포명=배포명 기존 유지, 변경 없음
[x] R4. N/A — 기본 브랜치 main 기존 유지(본 PR head=feat/spe2-a10-event-management)
[x] R5. N/A — GitHub remote 기존 유지, 변경 없음
```

### D1~D5 (폴더 구조)
```
[x] D1. Products\dangol\ 하위, 2.4 골격 준수(app/, app/api/, lib/, tests/ 기존 위치 그대로)
[x] D2. app/events/page.tsx, app/api/events/**/route.ts 모두 기존 app-skeleton 규칙 내부에 위치
[x] D3. .env는 본 PR에서 미변경, 기존 .gitignore 상태 유지
[x] D4. 임시 폴더(_pending/_archive 등) 신설 없음
[x] D5. 시크릿 파일 신설·이동 없음
```

### B1~B5 (배포)
```
[x] B1. N/A — 배포 플랫폼 설정 변경 없음(Vercel 기존 유지)
[x] B2. N/A — 운영 배포 브랜치 변경 없음(main 유지, 본 브랜치는 아직 미머지)
[ ] B3. CEO 승인 전 — 본 PR은 아직 push/merge되지 않음(PROHIBITED 조항 준수, 지시서상 "No git push to main / no merge"). CEO 승인 후 머지 시점에 체크
[x] B4. N/A — /health 엔드포인트 변경 없음
[x] B5. N/A — 신규 env 없음
```

### M1~M7 (DB 연결)
```
[x] M1. N/A — 신규 테이블/마이그레이션 없음(SP-E1이 스키마 소유, 본 스프린트는 UI+검증 로직만)
[x] M2. N/A — 위성 진입 칼럼 신설 없음, 기존 events.store_link_id / event_participations.customer_id(UUID) 그대로 조회
[x] M3. N/A — cross-project 참조 없음(동일 프로젝트 dangol DB 내 기존 FK만 사용)
[x] M4. 스키마 변경 없음(SP-E1이 이미 RLS ON 적용된 테이블만 조회/삽입)
[x] M5. 환경변수 변경 없음(DANGOL_DB_* 기존 그대로)
[x] M6. N/A — 신규 테이블 없음
[x] M7. N/A — 마스터DB(itdalab-infra/itdalab-master) 무관(본 스프린트는 dangol 제품 운영 DB 내부 로직만)
```

### V1~V4 (하네스 블록 공유)
```
[x] V1. N/A — 위성 테이블 진입 칼럼 신설 없음
[x] V2. N/A — cross-project 위성 테이블 신설 없음
[x] V3. N/A — place_id 관련 변경 없음
[x] V4. campaign_id 신규 사용 없음(미운영 예약어 미접촉)
```

### E1~E6 (시크릿·환경변수)
```
[x] E1. N/A — env 키 신설/변경 없음
[x] E2. N/A — 표준 키명 카탈로그 대상 변경 없음
[x] E3. N/A — .env.example 변경 없음
[x] E4. N/A — .gitignore 변경 없음
[x] E5. PR 본문·코드·로그에 시크릿 평문 없음 확인. `PREANNOUNCE_UNIT_PRICE_KRW`는 시크릿이 아닌 표시용 placeholder 단가(코드 주석에 [CONFIG] 명시, CEO 실단가 확인 전까지 사용)
[x] E6. N/A — 시크릿 값 위치 변경 없음
```

---

## 수정/신규 파일
MOD: `lib/events.ts`, `app/components/AppHeader.tsx`
NEW: `app/api/events/route.ts`, `app/api/events/[id]/route.ts`, `app/api/events/[id]/announce/route.ts`, `app/events/page.tsx`, `tests/events_manage_api.test.ts`, `tests/events_manage_rls.test.ts`, `tests/events_announce.test.ts`
