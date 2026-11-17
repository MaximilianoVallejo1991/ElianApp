# Proposal: Permissions and Process Cleanup

## Intent

Seven findings were raised, triaged and deliberately deferred across Cycle 1 (`money-correctness-fixes`) and Cycle 2 (`closure-concurrency-guards`) because each one was broader than the cycle that found it. None was dismissed; each was recorded with a named owner — this change. They fall into three families. **Permission drift**: the frontend gates expense delete and unlock with a single `isCreator || isGroupOwner` rule while the backend enforces three *different* rules, so buttons render for users who will be refused — and the unlock handler swallows the 403 in a bare `catch {}`, making the button silently do nothing. **Missing authorization and validation guards**: `item-reporting.service.js` checks `deletedAt` nowhere, so a soft-deleted COLLECTIVE expense still accepts items and recomputes its splits; `updateItem`/`deleteItem` check item ownership but never participation, the check `reportItem` got in Cycle 1; `computeSplits`' EQUAL branch accepts any `participantIds` list with zero membership validation while the PERCENTAGE branch five lines below validates every id. **Process hygiene**: `deleteGroup` takes locks Group→Period, the exact inverse of `finalClosure`'s deliberate Period→Group, a real `40P01` deadlock cycle Cycle 2 accepted and escalated; and the atomic-guard shape Cycle 2 introduced is hand-rolled six times with no helper. All seven are small, independent and low-ceremony except the last, which touches concurrency-critical merged code and must be treated as a concurrency change, not a refactor.

## Scope

### In Scope

1. **Frontend/backend permission alignment** — each expense button gated by its OWN backend rule, extracted into a tested pure helper (mirrors Cycle 1's `utils/payments.js` pattern), plus surfacing the swallowed unlock error
2. **`deletedAt` guard in `item-reporting.service.js`** — `reportItem`, `updateItem`, `deleteItem`, `recomputeAndPersist`, `getItemStatus`; mirrors `unlockExpense`'s existing `EXPENSE_NOT_FOUND` 404 pattern
3. **Participant check on `updateItem`/`deleteItem`** — the same unconditional `NOT_PARTICIPANT` 403 `reportItem` enforces (see Risks: this interacts with a newly-found money bug)
4. **Membership validation for `computeSplits`' EQUAL branch** — one shared validation helper both branches call, not a third copy
5. **`splits: []` treated as omitted for PERCENTAGE in `updateExpense`** — mirror `participantIdsNotProvided` onto `needsSplitsReconstruction`
6. **`deleteGroup` lock reordering** — explicit `$transaction`, `period.deleteMany` before `group.delete`, matching `finalClosure`'s Period→Group direction
7. **`assertAtomicTransition` helper** — extracted from the 6 hand-rolled call sites, with its own barrier concurrency tests proving every Cycle 2 guarantee survives

### Out of Scope

- **Render deploy CI/migration gating** — originally grouped with this change during Cycle 1 planning; **split out by explicit owner decision during this change's scoping** into its own future item. It is live-infrastructure configuration (a Render build command, a new GitHub Actions workflow), not code reviewable the same way as the 6 items above. Nothing is proposed or designed for it here.
- Any behavior change to the Cycle 2 guards themselves. Item 7 is a **pure extraction**: same SQL shape, same ordering, same error codes. Cycle 2's merged requirements are the regression contract.
- Re-litigating anything settled in Cycle 1/2: soft-delete filters, split rounding, closure/payment concurrency semantics.
- **Payment resolution concept for REJECTED payments** — Engram `architecture/payment-rejection-resolution-concept`; a product/schema effort, its own future change.
- **Authoritative persisted `participantIds` on `Expense` for EQUAL/PERCENTAGE** — Engram `architecture/expense-participantIds-authoritative-source`; the structural fix that would supersede item 5 entirely. Needs a migration; its own future change.
- `deleteGroup`'s read-then-delete precondition staleness (a concurrently-created expense can be cascade-deleted). Same race class Cycle 2 explicitly out-scoped. **See Risks — if the owner opts in, item 7 must move first.**
- Any new endpoint, status, schema field or migration. This change is code-only.

## Capabilities

### New Capabilities

None. All seven items land inside existing live specs under `openspec/specs/`.

### Modified Capabilities

- `expense-management`: items 1–5. Expense **delete** MUST be creator-or-group-owner; **unlock** MUST be creator-only; **edit** stays payer-or-creator-or-group-owner (already correct — pin it so it cannot drift). Item mutation on a soft-deleted expense MUST 404. `updateItem`/`deleteItem` MUST require participation, not only ownership. EQUAL `participantIds` MUST be validated against active membership and rejected with `INVALID_PARTICIPANTS` 400, matching PERCENTAGE. `PUT { amount, splits: [] }` on PERCENTAGE MUST reconstruct from persisted data, not 400.
- `group-management`: item 6. Group deletion MUST acquire `Period` before `Group`, so it can never deadlock against period closure.
- `period-management`, `payment-acceptance`: **no delta.** Item 7 is behavior-preserving by definition; a spec delta here would mean the extraction changed something it must not.

## Approach

1. **Item 1 — three rules, not one.** Verified in current code: `updateExpense` (L546) allows payer OR creator OR group owner; `deleteExpense` (L806-815) allows creator OR group owner, **no payer**; `unlockExpense` (L853) allows **creator only**. The frontend (`GroupDetailPage.jsx` L1091-1094) defines `isCreator = payerId === me || createdById === me` and reuses it for edit, delete and unlock. So `canEditExpense` is *accidentally exact*, while `canDeleteExpense` and the unlock gate (L1192) both over-grant to a payer-who-is-not-creator. Extract `apps/frontend/src/utils/expensePermissions.js` exporting `canEditExpense`, `canDeleteExpense`, `canUnlockExpense` as pure functions of `(expense, group, userId)`, each a 1:1 transcription of its backend counterpart, unit-tested as a truth table — the exact shape Cycle 1 PR 4 established with `utils/payments.js`. Also replace the unlock handler's bare `catch {}` (L1200-1202): a refused action must not look like a dead button.
2. **Item 2 — `deletedAt` where it is currently absent everywhere.** Confirmed: zero occurrences of `deletedAt` in `item-reporting.service.js`. `reportItem` (L26), `updateItem` (L85, via `include: { expense: true }`), `deleteItem` (L128), `recomputeAndPersist` (L161) and `getItemStatus` (L235) all read an `Expense` and act without it. Copy `unlockExpense`'s exact form — `if (expense.deletedAt !== null) throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found')` — so a soft-deleted expense is indistinguishable from a missing one, consistently with the rest of the codebase. `recomputeAndPersist` already returns `null` for non-COLLECTIVE; a soft-deleted expense takes the same inert path rather than throwing, since it is called internally after a mutation that will itself have been rejected.
3. **Item 3 — participation, not just ownership.** `updateItem` (L94) and `deleteItem` (L137) check `item.userId !== userId` only. Add `reportItem`'s check (L44-46) verbatim, keeping its authorization-before-state ordering so `NOT_PARTICIPANT` 403 beats `EXPENSE_LOCKED` 409. **This interacts with a money bug found while writing this proposal — see Risks row 1. Design MUST resolve that before this item is specced**, because the check alone makes an orphaned item permanently unremovable while it keeps corrupting the split sum.
4. **Item 4 — one validation helper, called twice.** The PERCENTAGE branch (L104-110) builds `new Set(await getActiveMemberIds(groupId))` and throws `INVALID_PARTICIPANTS` 400 per offending id; the EQUAL branch (L86-88) assigns `memberIds = participantIds` with nothing. Extract `assertActiveMembers(groupId, userIds)` inside `expense.service.js` and call it from both branches — a third copy is exactly the duplication this change exists to remove. Shared, so it fixes `createExpense` and `updateExpense` together. Reuses the existing `getActiveMemberIds` and the already-registered `INVALID_PARTICIPANTS` code; no new error code.
5. **Item 5 — one-line normalization, already-written sibling.** L620-621 reads `effectiveSplitsInput === undefined`; L609-610 already reads `!effectiveParticipantIds || effectiveParticipantIds.length === 0`. Mirror the second onto the first. Fails CLOSED today (`INVALID_SPLITS` 400, no misassignment), so this is a correctness-of-contract fix, not a money fix. Note for design: the `effectiveSplitType !== 'EQUAL'` gate (Cycle 1's third addendum, Fix 2) must survive untouched — it is a deliberate query optimization, not part of the condition being normalized.
6. **Item 6 — give `deleteGroup` a transaction it does not have.** Current body (L240-278) is four sequential reads then a bare `prisma.group.delete({ where: { id: groupId } })` (L277) with no `$transaction` at all; `Period` disappears via `onDelete: Cascade` (`schema.prisma`), which is what takes the Group→Period order. Wrap the deletion in `prisma.$transaction` and issue `tx.period.deleteMany({ where: { groupId } })` first, then `tx.group.delete(...)` — Period→Group, same direction as `finalClosure` (`closure.service.js` L430-447). The cascade still exists as a safety net; the explicit delete exists to fix lock *order*. Delete the now-stale lock-order warning comment in `finalClosure` (L425-429) in the same commit, or it becomes a lie.
7. **Item 7 — extraction under concurrency rigor, not refactor rigor.** Six confirmed, structurally identical call sites: `closure.service.js` L185-192 (`startClosure`), L255-264 (`completeClosure`), L343-352 (`partialClosure`), L430-441 (`finalClosure`); `payment.service.js` L304-309 (`acceptPayment`), L375-383 (`rejectPayment`). Each is `tx.<model>.updateMany({ where: { id, status: X }, data }) ` then `if (guard.count !== 1) throw new AppError(code, 409, msg)`. Extract to `apps/backend/src/utils/transitions.js` (matching the existing `splits.js`/`errors.js` naming), signature `assertAtomicTransition(delegate, { where, data, errorCode, errorMessage })` — taking the **Prisma model delegate** (`tx.period`) rather than a `(tx, modelName)` string pair, so the shared Prisma mock needs no change and there is no dynamic property access to get wrong. It performs the `updateMany`, throws `AppError(errorCode, 409, errorMessage)` on `count !== 1`, and returns nothing. Error codes and messages stay per-call-site, so zero API-contract change. **Non-negotiable constraints**: the helper MUST remain the *first* statement of its transaction at every call site (Cycle 2's ADR-4 Period→Group ordering), and 409 is hardcoded because all six are conflicts. **Tests**: reuse `apps/backend/src/services/__tests__/concurrency-barrier.js` unmodified; every existing Cycle 2 concurrency test must stay green untouched, and the new helper suite must carry Cycle 2's own ADR-13 structural assertions — the status predicate present in the `where`, the unguarded `update` never called, and `invocationCallOrder` proving guard-first. If a single Cycle 2 test needs editing to pass, the extraction is wrong.
8. **Ordering (recommended, with one conditional fork).** Item 7 goes **LAST**, as its own PR. Items 1–6 were read and confirmed to introduce **zero new atomic-guard call sites** — items 1–5 are permission/validation checks, item 6 is lock reordering with no status guard — so there is no retrofit cost to writing them before the helper exists, and no benefit to writing them after. Meanwhile item 7 is the only item that can regress already-verified concurrency code, so it belongs on top of a stable baseline where a revert costs nothing else. **The fork**: if the owner opts into guarding `deleteGroup`'s preconditions atomically (currently out of scope), item 6 gains a 7th call site and item 7 must move **FIRST** so item 6 is written against the helper instead of being retrofitted. This is the one ordering decision that is not mine to make.
9. **Delivery (`ask-on-risk`, `stacked-to-main`).** Five PRs, each independently revertible and comfortably under the 400-line budget: **#1** item 1 (frontend only); **#2** items 2+3 (one service file, one test file, cohesive); **#3** items 4+5 (both in `expense.service.js`); **#4** item 6; **#5** item 7 (largest — 6 call sites plus a new concurrency suite). Items 2/3 and 4/5 are paired because they share a file and a test file; splitting them would produce two PRs with overlapping diffs. Strict TDD throughout: one failing test precedes every fix, `pnpm --filter backend test && pnpm --filter frontend test`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/frontend/src/utils/expensePermissions.js` | New | Pure `canEditExpense` / `canDeleteExpense` / `canUnlockExpense`, each a 1:1 transcription of its backend rule (item 1) |
| `apps/frontend/src/utils/__tests__/expensePermissions.test.js` | New | Truth table across creator / payer / group-owner / unrelated × the three actions |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modified | L1091-1094: `isCreator`/`canEditExpense`/`canDeleteExpense` replaced by the helper. L1161 delete button → `canDeleteExpense`; L1192 unlock gate → `canUnlockExpense`. L1196-1202: bare `catch {}` must surface the refusal (item 1) |
| `apps/backend/src/services/item-reporting.service.js` | Modified | `deletedAt` guard in `reportItem` (L26), `updateItem` (L85), `deleteItem` (L128), `recomputeAndPersist` (L161), `getItemStatus` (L235) (item 2) |
| `apps/backend/src/services/item-reporting.service.js` | Modified | `NOT_PARTICIPANT` 403 added to `updateItem` (L94) and `deleteItem` (L137), authorization-before-state (item 3) |
| `apps/backend/src/services/expense.service.js` | Modified | New `assertActiveMembers(groupId, userIds)`; called from `computeSplits`' EQUAL branch (L86-88) and replacing the inline loop in PERCENTAGE (L104-110) (item 4) |
| `apps/backend/src/services/expense.service.js` | Modified | L620-621 `needsSplitsReconstruction`: `=== undefined` → `!x \|\| x.length === 0`, preserving the `!== 'EQUAL'` gate (item 5) |
| `apps/backend/src/services/group.service.js` | Modified | `deleteGroup` (L240-278): bare `prisma.group.delete` (L277) becomes a `$transaction` with `tx.period.deleteMany` first (item 6) |
| `apps/backend/src/utils/transitions.js` | New | `assertAtomicTransition(delegate, { where, data, errorCode, errorMessage })` (item 7) |
| `apps/backend/src/services/closure.service.js` | Modified | Four guards → helper calls: L185-192, L255-264, L343-352, L430-441. Also deletes `finalClosure`'s now-stale lock-order comment (L425-429) (items 6, 7) |
| `apps/backend/src/services/payment.service.js` | Modified | Two guards → helper calls: L304-309, L375-383 (item 7) |
| `apps/backend/src/utils/__tests__/transitions.test.js` | New | Helper unit tests: `count === 1` passes, `count === 0`/`> 1` throws the caller's code at 409 |
| `apps/backend/src/services/__tests__/transition-helper-concurrency.test.js` | New | Barrier tests (reusing `concurrency-barrier.js` unmodified) proving atomicity, guard-first ordering and one-winner semantics survive the extraction at all six sites |
| `apps/backend/src/services/__tests__/closure-concurrency.test.js`, `payment-concurrency.test.js` | Unchanged | Cycle 2's suites are the regression contract for item 7. Needing to edit them means the extraction is wrong |
| `apps/backend/src/services/__tests__/concurrency-barrier.js` | Unchanged | Reuse only — explicitly must not be modified |
| `apps/backend/prisma/schema.prisma` | Unchanged | No migration. `Period.onDelete: Cascade` stays; item 6 fixes lock order, not the cascade |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **NEW — item 3 alone makes an orphaned item unremovable AND the split sum silently wrong.** `calculateCollectiveSplits` (`utils/splits.js` L160) iterates `participantIds`, so an item from a departed participant is **dropped from the splits** — yet `recomputeAndPersist` (L170) counts it in `itemsSum`, which is what decides `COMPLETED`. Expense 150, participants [A,B], items A=50 B=50 orphan D=50 → `itemsSum === total` → COMPLETED, but splits sum to 100. **The payer is under-reimbursed and the money vanishes from balances.** `generateSplits` has no sum guard, unlike `computeSplits` (L126-129). Adding item 3's check makes the orphan permanently unremovable (owner blocked by `NOT_PARTICIPANT`, nobody else owns it) while it keeps corrupting the sum | High | **DECISION NEEDED BEFORE SPEC.** Recommended: (b) make `recomputeAndPersist` exclude non-participant items from `itemsSum`, so an orphan is inert and item 3's check becomes safe, **plus** port `computeSplits`' sum guard into `generateSplits` as defense-in-depth. Alternatives: (a) ship item 3 as-written and accept silent under-splitting; (c) cascade-delete orphans when `participantIds` shrinks. (b) is cheapest and coherent, but it is a money-correctness fix inside a cleanup cycle — **owner's call** |
| Item 7 reintroduces a race Cycle 2 just closed | Med | Treated as a concurrency change, not a refactor: own barrier suite with ADR-13 structural assertions; all four Cycle 2 suites must pass **unedited**; delegate-passing signature avoids dynamic model lookup; shipped last and alone so revert is isolated |
| Item 7 is extracted before the owner decides on `deleteGroup` preconditions, forcing a retrofit | Med | The conditional fork is stated explicitly in Approach #8. **Confirm with owner before tasks**: if preconditions are in, item 7 moves first |
| Item 1 over-restricts and removes a button a user legitimately had | Med | Verified against current backend source, not assumed: payer-not-creator currently sees delete/unlock and receives 403. Narrowing removes a button that never worked. Truth-table tests cover all four actor roles |
| Item 1's `catch {}` fix leaks a raw error into the UI | Low | Surface the existing i18n error path already used elsewhere in this page; no new error shape |
| Item 4 rejects an EQUAL expense that previously succeeded (departed-member participant lists) | Med | Intentional — it is the bug. But it can 400 a request shape that worked yesterday, which is an **API behavior change**: confirm with owner, and confirm whether existing persisted expenses with departed participants can still be edited |
| Item 6 changes `deleteGroup` from one statement to a transaction, a new failure surface | Low | Preconditions already refuse deletion when active expenses or payments exist, so the transaction is small. `onDelete: Cascade` remains as a net if the explicit `deleteMany` is ever removed |
| Item 6's deadlock is untestable with the mocked Prisma client | High | Accepted and stated, exactly as Cycle 2 did. Tests assert *statement order* (`invocationCallOrder`: `period.deleteMany` before `group.delete`), which is the part we control; real `40P01` behavior needs the deferred Postgres harness |
| Item 2 makes `recomputeAndPersist`/`getItemStatus` 404 on a soft-deleted expense that some caller reads for history | Med | Design MUST enumerate every caller before adding the guard. `recomputeAndPersist` takes the inert `null` path rather than throwing, for exactly this reason |
| Seven items in one change invites scope drift into Cycle 1/2 territory | Med | Out of Scope names the three deferred architecture items and their Engram keys explicitly. Any new finding gets recorded as a future item, not absorbed — risk row 1 is the live test of this rule |
| Item 5's fix is in the fallback Cycle 1 explicitly stopped iterating on | Low | Single normalization, already-written sibling four lines above; the `!== 'EQUAL'` optimization gate is called out as must-survive |

## Rollback Plan

1. Five independent PRs, five independent reverts. Items 1–6 share no code with each other; reverting any one restores exactly its prior behavior.
2. No schema, no migration, no data mutation anywhere in this change. Every revert is pure code with zero data risk.
3. Item 7 is last and alone: reverting it restores the six inline guards with their original bodies and leaves items 1–6 untouched. Because the extraction is behavior-preserving, the revert is also behavior-preserving — Cycle 2's protections hold either way.
4. Reverting item 6 restores the Group→Period cascade order and with it the narrow `40P01` window Cycle 2 already accepted as harmless (one request 500s, zero corruption). Any group already deleted stays deleted; the cascade did the same work.
5. Reverting items 2/3/4 re-opens the respective holes but corrupts nothing retroactively: no data is rewritten by any of them.
6. Reverting item 1 restores the over-granted buttons; no persisted state is involved, since the backend was always the real gate.
7. If risk row 1 is resolved via option (b), that part reverts with item 3's PR and is the only piece of this change that alters money math — so it must be separately verified before merge, not just after.

## Dependencies

- `AppError(code, status, message)` and codes `EXPENSE_NOT_FOUND`, `NOT_PARTICIPANT`, `FORBIDDEN`, `INVALID_PARTICIPANTS`, `CLOSURE_BLOCKED`, `NOT_PENDING` in `apps/backend/src/utils/errors.js` — all already registered; this change adds none
- `getActiveMemberIds` (`expense.service.js` L60) for item 4's shared validator
- `createBarrier` from `apps/backend/src/services/__tests__/concurrency-barrier.js` — reused unmodified for item 7
- `apps/frontend/src/utils/payments.js` as the precedent pattern for item 1's extracted helper
- Prisma 7 `updateMany`/`deleteMany` returning `{ count }`; Postgres `READ COMMITTED` default isolation
- `money-correctness-fixes` (Cycle 1) and `closure-concurrency-guards` (Cycle 2) merged and archived — all seven items assume post-Cycle-2 bodies of the files they touch
- Strict TDD active: `pnpm --filter backend test && pnpm --filter frontend test` (both run-once)
- **Owner decision on risk row 1 before `sdd-spec`**, and on the item 6/7 ordering fork before `sdd-tasks`

## Success Criteria

- [ ] A payer who is neither creator nor group owner sees the expense **edit** button but NOT **delete** and NOT **unlock**; a group owner sees edit and delete but NOT unlock; the creator sees all three — asserted as a truth table in `expensePermissions.test.js`
- [ ] Every expense button's frontend gate is the extracted helper, and each helper function matches its backend rule exactly: delete = creator-or-owner, unlock = creator-only, edit = payer-or-creator-or-owner. No `isCreator` conflating payer with creator remains in `GroupDetailPage.jsx`
- [ ] A refused unlock produces visible feedback; no `catch {}` swallows a 403 on this page
- [ ] `reportItem`, `updateItem`, `deleteItem` and `getItemStatus` all return `EXPENSE_NOT_FOUND` 404 on a soft-deleted expense; `recomputeAndPersist` is inert rather than mutating it. A soft-deleted COLLECTIVE expense can no longer accept an item, change status, or regenerate splits
- [ ] A user removed from `participantIds` after reporting receives `NOT_PARTICIPANT` 403 from both `updateItem` and `deleteItem`, and the 403 precedes any lock/state check
- [ ] The orphaned-item outcome chosen for risk row 1 is implemented and proven: no COLLECTIVE expense can reach `COMPLETED` with generated splits that fail to sum to its amount (±0.01)
- [ ] An EQUAL expense created or updated with a `participantIds` list containing a non-member or departed member is rejected with `INVALID_PARTICIPANTS` 400, for both `createExpense` and `updateExpense` — same code and shape PERCENTAGE already returns
- [ ] `computeSplits` contains exactly ONE membership-validation implementation, called by both branches; no third copy exists
- [ ] `PUT { amount, splits: [] }` on a PERCENTAGE expense reconstructs from persisted splits and succeeds, instead of returning `INVALID_SPLITS` 400; the `effectiveSplitType !== 'EQUAL'` optimization gate still skips the reconstruction query pair for EQUAL
- [ ] `deleteGroup` runs inside a `$transaction` and deletes `Period` rows before `Group`; `invocationCallOrder` proves it. No backend write path takes Group before Period, so the inversion flagged in Cycle 2's Lock Order Audit no longer exists — and `finalClosure`'s stale warning comment is gone
- [ ] All six atomic-guard call sites call `assertAtomicTransition`; no inline `updateMany` + `count !== 1` pair remains in `closure.service.js` or `payment.service.js`
- [ ] The helper is the FIRST statement of its transaction at all six sites, each still throws its own error code at 409, and no response shape or error code changed anywhere
- [ ] All four Cycle 2 concurrency suites pass **without a single edit**; the new helper suite additionally proves one-winner semantics and guard-first ordering via barrier + structural assertions
- [ ] No `setTimeout` or fixed delay appears in any new test; `concurrency-barrier.js` is reused and unmodified
- [ ] One failing test preceded every one of the seven fixes; `pnpm --filter backend test && pnpm --filter frontend test` passes
- [ ] `pnpm -r run build` passes
- [ ] No schema change, no migration, no new error code registered
- [ ] Nothing in this change touches Render configuration or CI workflows
