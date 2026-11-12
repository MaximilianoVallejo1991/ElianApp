# Verify Report: closure-concurrency-guards -- PR 4 (Phase 5, final PR in chain)

**Change**: closure-concurrency-guards
**Scope verified**: PR 4 only -- `fix/period-current-unique-index`, 2 commits, off `main` (which already has PR 1/2/3 merged via PR #7)
**Mode**: full artifact set (proposal/spec/design/tasks/apply-progress all present)
**Verdict**: PASS

## Completeness -- Phase 5 tasks

| Task | Status | Evidence |
|---|---|---|
| 5.1 previewFeatures partialIndexes on generator client | DONE | schema.prisma L1-4, confirmed by direct read |
| 5.2 unique groupId where isCurrent true on Period | DONE | schema.prisma L96, alongside all 3 pre-existing indexes (none dropped) |
| 5.3 Generated migration, plain CREATE UNIQUE INDEX, no CONCURRENTLY | DONE | migration.sql contains exactly one statement |
| 5.4 Pre-flight duplicate-isCurrent check | DONE (noted, not scripted, as designed) | 0 rows per apply-progress, consistent with a pre-production DB |

All Phase 5 checkboxes in tasks.md are checked. No unchecked task found for this PR scope.

## Design conformance (ADR-8/9/10, "Native partial unique index" + "Migration" sections)

| Design requirement | Implementation | Match |
|---|---|---|
| previewFeatures partialIndexes added, no other generator client change | provider prisma-client-js kept, one line added | Exact |
| unique groupId where isCurrent true added alongside existing 3 indexes, none removed | Confirmed: index groupId, index groupId+status, index groupId+isCurrent all still present, unique constraint appended after | Exact |
| ADR-10: no hand-edited CONCURRENTLY, plain DDL, no unrelated statements | migration.sql is a single line CREATE UNIQUE INDEX "Period_groupId_key" ON "Period"("groupId") WHERE ("isCurrent" = true) -- byte-identical to design.md's predicted output | Exact |
| ADR-11: do not catch P2002 in service code | No touches to closure.service.js/payment.service.js in this diff -- confirmed by scope check below | Exact (nothing to catch -- correctly out of scope) |
| Migration folder naming convention | 20261111232910_add_period_current_unique_constraint matches the YYYYMMDDHHMMSS_snake_case_name convention, consistent with 20260612013051_init, 20260616004935_add_drinks_gifts_categories | Exact |
| Migration / Rollout step 5: code guards first, migration second | PR 1-3 (all guard code) already merged to main before this PR branched | Confirmed by branch history |

No design deviation found for this PR's scope.

## Live-environment verification (not just static file inspection)

1. prisma migrate status (run from apps/backend, this session, not trusted from the apply report alone):
   3 migrations found in prisma/migrations
   Database schema is up to date!
   Confirms the new migration is recorded in _prisma_migrations and the live schema matches -- no drift, no pending/failed migration state.

2. pg_indexes query (small Node script using pg + dotenv, reading DATABASE_URL indirectly the same way the apply report describes -- connection string never printed, only derived host/port/db for identification):
   Period_groupId_key: CREATE UNIQUE INDEX "Period_groupId_key" ON public."Period" USING btree ("groupId") WHERE ("isCurrent" = true)
   All 4 pre-existing indexes also present and untouched (Period_pkey, Period_groupId_idx, Period_groupId_status_idx, Period_groupId_isCurrent_idx). The partial unique index genuinely exists in the live database, not merely declared in the migration file.

## Test / build evidence (executed, not trusted from report)

| Command | Result |
|---|---|
| pnpm --filter backend test | 7 files, 73/73 passed |
| pnpm --filter frontend test | 3 files, 45/45 passed |
| pnpm -r run build | frontend built clean (pre-existing CSS/chunk-size warnings, unrelated noise, not new); backend/root have no build step -- "2 of 3 workspace projects" scope is expected, pre-existing |

These numbers match the apply-progress's self-reported "73/73 backend, 45/45 frontend, zero regressions" exactly -- independently reproduced in this verify pass, not merely copied from the apply report.

## Scope containment

git diff main...fix/period-current-unique-index --stat:
  apps/backend/prisma/migrations/.../migration.sql              |  2 ++
  apps/backend/prisma/schema.prisma                              |  4 +++-
  openspec/changes/closure-concurrency-guards/tasks.md           | 14 ++++++++++----

Exactly 3 files. No .service.js file touched, no frontend file touched. Matches the PR's stated "schema-only, no service-code changes" scope precisely.

## Commit attribution

Both commits on this branch (92f452c, 66e55e9) inspected via git log. Neither contains Co-Authored-By or any AI-attribution trailer. Matches apply-progress's explicit note that this PR's instructions took precedence over a conflicting session default.

## Unusual execution path sanity check (tasks.md addenda)

Addendum 1 (non-interactive workaround) and the apply-progress's Execution notes describe: migrate dev refusing in a non-TTY shell, then migrate diff --from-config-datasource --to-schema --script to get Prisma's own computed SQL, hand-placed into a conventionally-named migration folder, then migrate deploy to apply and record it, plus an orphaned advisory lock from a failed first attempt cleared via pg_terminate_backend.

Verified end state, independent of the path taken:
- migrate status reports clean, in-sync, no pending/failed migrations -- no residue from the aborted attempts.
- The migration folder and SQL are indistinguishable from what migrate dev would have produced (content matches design.md's prediction verbatim, naming matches convention).
- The live index exists and matches the file exactly (verified above).
- No second/duplicate migration folder, no SQL file left in a broken or partial state.
- pg_indexes shows no orphaned/invalid index (an aborted CONCURRENTLY attempt would leave an INVALID index; not applicable here since CONCURRENTLY was never used, per ADR-10).

The unusual path produced a clean, correct, standard end state. No residual risk found.

## Addendum 2 sanity check (P2002-fallback decision)

Tasks.md's second PR 4 addendum records that an unguarded P2002 from this index (only reachable if the app-level guard is already bypassed -- a separate, prior bug) falls through to error.middleware.js's generic P2002 handler as a 400 UNIQUE_CONSTRAINT, not the 500 ADR-11 assumed. This is an owner-confirmed accepted outcome, consistent with ADR-11's decision not to add a dedicated catch. No code change was required or made for this; it is a documented observation, not a task. Correctly recorded as prose, not a false checked-box for untested behavior.

## Issues

CRITICAL: None.

WARNING: None directly attributable to PR 4.

SUGGESTION:
1. The deferred finding carried over from PR 3 (Rejection Blocks STATIC Closure spec requirement vs. closure.service.js's code comment claiming REJECTED payments are non-blocking, zero test coverage either way) remains open. It does not block PR 4 -- it is pre-existing, out of this PR's untouched-service-code scope -- but it should be resolved before the overall closure-concurrency-guards change is archived, since an open spec/code mismatch should not be swept into archive as done.
2. apps/backend/.atl/ and an unrelated extra documents/ElianApp.md appear as untracked files in the working tree; neither is part of this PR's diff (confirmed via git diff --stat) and neither was created by this PR's commits -- noted for hygiene only, not a PR-4 defect.

## PR 4 readiness

Ready to push / open for human review. Schema change, migration, and tasks.md bookkeeping are all consistent with design.md, scope is tightly contained to 3 files, the live database genuinely has the new partial unique index, migration state is clean (migrate status reports in-sync, no pending/failed), and the full test suite plus build were independently re-run and passed (73/73 backend, 45/45 frontend, build green). No CRITICAL or WARNING findings block this PR.

## Note for Phase 6 (final verification, after this PR merges -- not executed here)

Per tasks.md:
- 6.1: re-run pnpm --filter backend test and pnpm --filter frontend test -- --run on main after all 4 PRs are merged (this verify pass ran it on the PR 4 branch pre-merge; Phase 6 must re-confirm on the merged main state).
- 6.2: re-run pnpm -r run build on merged main.
- 6.3: grep sweep across both service files confirming no period.update( or payment.update( remains with a bare where id on any state-transition path (deletePayment's legitimate soft-delete update must remain, and must not be flagged as a false positive).
- Additionally (not in tasks.md 6.x but flagged by this and the prior PR's verify passes as open before archive): resolve the deferred REJECTED-payments-blocks-closure spec/code discrepancy before the change is archived.
