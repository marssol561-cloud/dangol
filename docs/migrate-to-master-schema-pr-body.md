**Title:** chore(db): migrate dangol app to itdalab-master `dangol` schema (code only, no SQL)

**Summary**
- Every dangol Supabase client (`createClient` / `createServerClient` / `createBrowserClient`) now passes `db: { schema: 'dangol' }` — 98 call sites across 66 files (`lib/*`, `app/**` routes/pages, `tests/*`). Found via AST scan (TypeScript compiler API), not manual grep, so coverage is exhaustive.
- `lib/masterDb.ts` untouched — it is a plain `fetch` REST client against `public.stores` on the master project, not a supabase-js client, and was correctly out of scope.
- No env values changed, no SQL/migrations touched, no auth logic changed. All edits are additive (`db.schema` option) or pure type-annotation widening (see below) — zero runtime/behavior change.
- New: `lib/dangolDb.ts` exports `DangolClient` (`SupabaseClient<any, any, any>`, one `eslint-disable` line). Necessary because `SupabaseClient`'s schema generic defaults to `"public"` and structurally locks callers to it — once the client is typed for schema `"dangol"`, every helper function that previously took a bare `db: SupabaseClient` (in `lib/events.ts` ×20, `lib/coupons.ts` ×1, and 6 test files) failed to type-check. Retyped those params to `DangolClient` instead of scattering `any`. This is outside the literal FILE SCOPE list in the dispatch instruction but was required to hit the `tsc --noEmit` = 0 / `eslint` = 0 done-criteria; flagging it explicitly rather than folding it in silently.

**Test plan**
- [x] `npx tsc --noEmit` → exit 0
- [x] `npx eslint .` → 0 problems
- [x] AST verification script: 98/98 dangol client-creation sites carry `db.schema === 'dangol'`, 0 missing
- [x] `git diff` reviewed file-by-file — only `db.schema` insertions + the `DangolClient` type swap; no query/logic changes
- [ ] `npx vitest run` — **not run**. `.env.local`'s `DANGOL_DB_URL` still points at the old standalone dangol project (ref `gjiueiotuyzohndixxnq`), not itdalab-master (`dqqchrktdiacoccianbs`). That project very likely has no `dangol` schema exposed via PostgREST, so `.from()` calls would fail — but `auth.admin.createUser`/`signInWithPassword` calls in test `beforeAll` hooks are **not** schema-scoped and would still hit that project's real auth store before failing, risking data pollution on what may still be a live project. Declined to run rather than risk that. All 60 test files in `tests/*.test.ts` need CEO-provided `DANGOL_DB_URL` / `DANGOL_DB_ANON_KEY` / `DANGOL_DB_SERVICE_ROLE_KEY` for itdalab-master before the suite can be run safely.

**Not in this PR:** SQL/migrations, masterDb.ts, auth logic, env file changes, push/merge/deploy (CEO gate).
