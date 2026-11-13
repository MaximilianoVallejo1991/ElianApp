# Design: Permissions and Process Cleanup

## Technical Approach

Seven independent fixes, verified line-by-line against post-Cycle-2 source. Four of them are
one-sided transcriptions of a rule that already exists somewhere else in the codebase; three are
structural. The through-line: **every item makes two code paths that currently disagree agree, and
every item reuses an already-registered error code.**

| Item | Shape | Mechanism |
|------|-------|-----------|
| 1 | Frontend mirrors backend | New pure `expensePermissions.js`, three functions, one per backend rule |
| 2 | Missing guard, 5 sites | Copy `unlockExpense` L844-846 verbatim into `item-reporting.service.js` |
| 3 | **Two sums disagree** | One rule — "only participant items count" — applied at all 3 sum sites + a portable sum guard |
| 4 | One branch validates, its sibling does not | Extract `assertActiveMembers`, call from both, gated on caller-provided input |
| 5 | Sibling condition already normalized 11 lines above | Mirror `participantIdsNotProvided` onto `needsSplitsReconstruction` |
| 6 | Lock order inverted | Explicit `tx.period.deleteMany` ahead of `tx.group.delete`, inside a new `$transaction` |
| 7 | Same 12 lines, six times | Extract `assertAtomicTransition`; Cycle 2's suites are the regression contract |

### Error-code audit (grep-verified, not assumed)

`errors.js` has **no code registry** — `AppError(code, status, message)` accepts any string; the
list is a docblock only. Every code this change throws is already in live use:

| Code | Status | Live at | In the docblock? |
|------|--------|---------|------------------|
| `EXPENSE_NOT_FOUND` | 404 | `expense.service.js` L499/L534/L845 | Yes |
| `NOT_PARTICIPANT` | 403 | `item-reporting.service.js` L45 | Yes |
| `VALIDATION_ERROR` | 400 | `expense.service.js` L128 | Yes |
| `INVALID_PARTICIPANTS` | 400 | `expense.service.js` L108/L217/L230/L669 | **No — docblock gap** |
| `EXPENSE_LOCKED` | 409 | `item-reporting.service.js` L49/L99/L142 | **No — docblock gap** |
| `INVALID_SPLIT_TYPE` | 400 | `item-reporting.service.js` L35/L103 | **No — docblock gap** |

**Zero new codes registered.** Three codes are missing from the docblock (same oversight Cycle 2's
ADR-7 fixed for `INVALID_OPERATION`) — ADR-16 adds them as a docblock-only edit.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|-------------|-----------|
| ADR-1 | Frontend helper shape (item 1) | `apps/frontend/src/utils/expensePermissions.js`, three pure `(expense, group, currentUserId) => boolean` functions. Uniform arity even where a function ignores `group` | (a) `(expense, currentUserId, ownerId)` scalar args; (b) one `getExpensePermissions()` returning `{canEdit,canDelete,canUnlock}` | Uniform arity means a call site can never pass the right data to the wrong function. `group` is already in scope at `GroupDetailPage.jsx` L1092. (b) couples the three rules into one object that must be recomputed whenever any input changes — the truth table gets harder to test, not easier. Mirrors `utils/payments.js`: pure, no imports, JSDoc, one concern. |
| ADR-2 | `canUnlockExpense` includes the **state** preconditions, not just authorization | Transcribes all three of `unlockExpense`'s gates: `splitType === 'COLLECTIVE'` (L848) **and** `createdById === userId` (L853) **and** `status === 'COMPLETED'` (L857) | Authorization only (`createdById === userId`), leaving `isCollective`/`isLocked` as separate JSX conditions at L1192 | The brief's bar is "replicate the backend rule **exactly**". A creator-only helper returns `true` for a PENDING COLLECTIVE expense that the backend refuses with `INVALID_OPERATION` 400 — the same drift class item 1 exists to delete, just moved one level down. Keeping `isCollective && isLocked` in JSX re-creates the two-sources-of-truth problem. **Note**: backend gates on `status === 'COMPLETED'`, frontend L1192 gates on `isLocked === true`. These are set together (L180, L290) but are not the same field. The helper uses **`status === 'COMPLETED'`** — the backend's actual predicate. |
| ADR-3 | `canEditExpense` is pinned, not "left alone" | Written and truth-tested even though current behavior is already correct | Skip it, only fix delete/unlock | It is correct **by accident** — `isCreator` happens to mean payer-or-creator, which happens to match `updateExpense` L546. The accident is one refactor away from becoming a bug. Pinning it costs 6 lines and one test row; the success criteria demand it. |
| ADR-4 | Surfacing the swallowed 403 (item 1) | Replace `catch {}` (L1200-1202) with `catch (err) { alert(err.message \|\| 'Failed to unlock expense.'); }` and add `loadGroup()` — matching the page's own established idiom | (a) `setError(...)` into the page-level banner; (b) a new toast system; (c) i18n `t()` key | `alert(err.message \|\| '…')` is this page's **existing** pattern for one-off action failures — L229, L243, L273, L317, L329, L366. The page-level `setError` banner (L94) is reserved for *load* failures (L159-161). Introducing a toast or a new i18n key here is a UI change, not a bug fix, and the proposal's risk row says "no new error shape". The fallback string is un-i18n'd exactly like its six siblings — consistency over local improvement. |
| ADR-5 | `deletedAt` guard placement (item 2) | Immediately after the `!expense` / `!item` 404, **before** any authorization or state check. Exact form: `if (expense.deletedAt !== null) throw new AppError('EXPENSE_NOT_FOUND', 404, 'Expense not found');` | Place it after the participant/ownership check | Copied verbatim from `unlockExpense` L844-846 and `getExpense` L502-504 — a soft-deleted expense must be **indistinguishable from a missing one**, so it cannot leak existence to a non-participant. 404-before-403 is the established order; the Cycle 1 auth-before-state convention governs 403-vs-409, not 404-vs-403. |
| ADR-6 | `updateItem`/`deleteItem` read the expense via `include: { expense: true }` (L87, L130) | Guard reads `item.expense.deletedAt` — no extra query | Add a separate `expense.findUnique` | The relation is already loaded. Zero query cost. |
| ADR-7 | `recomputeAndPersist` on a soft-deleted expense | **Inert**, not throwing: widen L166 to `if (!expense \|\| expense.deletedAt !== null \|\| expense.splitType !== 'COLLECTIVE') return null;` | Throw `EXPENSE_NOT_FOUND` 404 | **Caller enumeration (proposal risk row 9 — required before adding this guard)**: exactly three callers, all internal to the file and all post-mutation (L69 `reportItem`, L114 `updateItem`, L147 `deleteItem`). After ADR-5 all three reject a soft-deleted expense *before* reaching the recompute, so throwing here is unreachable-by-construction. Returning `null` keeps the function total and preserves the existing non-COLLECTIVE contract shape. |
| ADR-8 | `getItemStatus` on a soft-deleted expense | **Throws** `EXPENSE_NOT_FOUND` 404 — add the guard after L242 | Return the stale status for history views | **Caller enumeration**: one caller, `expense.controller.js` L142 ← `GET /expenses/:id/items/status` ← frontend `api.js` L110. The frontend only ever reaches it from the expense list, which is already `deletedAt: null`-filtered (`listExpenses` L404). No history consumer exists. 404 matches `getExpense` L502. |
| ADR-9 | `NOT_PARTICIPANT` ordering in `updateItem`/`deleteItem` (item 3) | Inserted **after** the `FORBIDDEN` ownership check (L94-96 / L137-139), **before** the `EXPENSE_LOCKED` check (L98 / L141) | (a) Before `FORBIDDEN`; (b) replace `FORBIDDEN` with it | Both checks are authorization and both precede state — Cycle 1's convention is satisfied either way, so order between them is a message-quality choice. Ownership-first gives the more specific message ("your own item") for the common case; `NOT_PARTICIPANT` is then reached only by the item's actual owner, which is exactly the orphan case it exists to catch. (b) loses the ownership rule entirely — a participant could edit another participant's item. |
| ADR-10 | **The money bug — which items count** (item 3) | Filter the **array after fetch**, not the query: `const participantSet = new Set(expense.participantIds); const participantItems = expense.items.filter((i) => participantSet.has(i.userId));` then sum `participantItems` **and pass `participantItems` to `generateSplits`** | (a) Filter in the Prisma `include` (`items: { where: { userId: { in: … } } }`); (b) add the filter only to the sum, leaving `generateSplits` on `expense.items`; (c) cascade-delete orphans in `updateExpense` when `participantIds` shrinks | (a) is **impossible**: `participantIds` lives on the parent row and is unknown until the row is fetched — it would take two round trips to express what one `.filter()` expresses. (b) is the bug, restated: the defect is not "the sum is wrong", it is that **two code paths disagree about the input set**. Deriving `participantItems` once and feeding it to *both* `computeCollectiveStatus` and `generateSplits` makes the disagreement structurally impossible — that is the fix, the sum is a symptom. (c) is the proposal's option (c): most correct, but it mutates `ExpenseItem` rows from `updateExpense`, which is a new write path in a cleanup cycle. Deferred, recorded in Open Questions. |
| ADR-11 | Race against a concurrent participant-list edit (ADR-10, read-only consideration) | **None added.** Documented, not guarded | Wrap `recomputeAndPersist` in a `$transaction` with `SELECT … FOR UPDATE` on the expense row | Verified, not assumed: `participantIds` and `items` come from **one** `findUnique` + `include` (L161-164). The parent row — and therefore `participantIds` — is a single snapshot, so the filter is always self-consistent with the list it filters against. A concurrent `updateExpense` committing a shrunk `participantIds` after our parent read leaves us recomputing against a stale list; the *next* mutation recomputes correctly. That is precisely Cycle 2 ADR-6's accepted stale-precondition class, and the brief scopes this item as non-concurrency-critical. Note the pre-existing `include` subtlety: Prisma issues parent and children as **separate** queries, so an item committed between them is already visible-or-not non-deterministically — this change neither creates nor worsens that. |
| ADR-12 | Where the ported sum guard lives (item 3) | New **exported pure** function in `apps/backend/src/utils/splits.js`: `assertSplitsSumToTotal(splits, totalAmount)`, throwing `AppError('VALIDATION_ERROR', 400, 'Split amounts must sum to expense amount')`. Called from `generateSplits`, `createExpense`'s inline COLLECTIVE block, and `computeSplits` (replacing its inline L126-129) | (a) Inline the check inside `generateSplits` only; (b) add a `totalAmount` param to `calculateCollectiveSplits` and guard inside it; (c) export `generateSplits` from `item-reporting.service.js` and call it from `createExpense` | **Reuses Cycle 1 ADR-6's exact code, status and message** — no new error code, and `expense.service.test.js` L93 stays green unedited. (b) changes `calculateCollectiveSplits`' signature and every caller including `createExpense` L272, for a guard that is not split-type-specific. (c) makes `expense.service.js` depend on `item-reporting.service.js` for a math check. (a) leaves the guard **untestable** — it sits behind a `status === 'COMPLETED'` branch that, post-ADR-10, can no longer be false when the sum is wrong. Putting it in `splits.js` makes it a directly unit-testable pure function (red-then-green satisfied trivially), which resolves the tension with Cycle 2's ADR-11 "no unreachable untestable branches": we add a **tested** function, invoked at three sites where it currently always passes. The discovery's own `Learned` note demands exactly this — *"any future split-generating code path should carry that guard."* |
| ADR-13 | **`createExpense`'s COLLECTIVE inline path has the same bug** (new finding, expanded scope) | **Reject**, don't drop: after the existing participant-membership check (L229-231), add `const participantSet = new Set(data.participantIds); for (const item of items) { if (!participantSet.has(item.userId)) throw new AppError('INVALID_PARTICIPANTS', 400, \`User ${item.userId} is not a participant in this expense\`); }` | (a) Mirror ADR-10 — silently exclude non-participant items from `itemsSum` and the splits; (b) do nothing (out of proposal scope) | **Not in the proposal or the Engram discovery; found while reading `createExpense` for this design.** `createExpense` validates that every `participantIds` entry is an active member (L221-231) but never that every `items[].userId` is in `participantIds`. `POST { amount: 150, participantIds: [A,B], items: [A=50, B=50, D=50] }` → `itemsSum` 150 → `COMPLETED` → splits A=50,B=50 = **100**. Identical defect, different entry point. The asymmetry with ADR-10 is deliberate and load-bearing: in `recomputeAndPersist` the orphan **already exists** and must become inert, so exclusion is the only option; in `createExpense` both lists arrive in **one request body**, nothing legitimate produces the mismatch, and rejecting prevents the permanently-unremovable orphan (ADR-9 + `FORBIDDEN`) from ever being **born**. (a) would create exactly the stuck row this change exists to stop creating. **⚠ API behavior change — see Open Questions.** |
| ADR-14 | `getItemStatus`'s `itemsSum` (item 3) | Apply the ADR-10 filter here too (L244) | Leave it summing all items | Third sum site, same rule. Left unfiltered it would report `discrepancy: 0` on an expense `recomputeAndPersist` just set to `MISMATCH` — a UI that contradicts the stored status. "Only participant items count" must hold at **every** site that computes it, or the disagreement simply moves. |
| ADR-15 | Retroactive handling of pre-existing orphans (item 3) | **Forward-fix only. No backfill, no retroactive rejection.** | (a) Make `recomputeAndPersist` throw on detecting a pre-existing orphan; (b) ship a data-repair script | Consistent with Cycle 1's established pre-production/no-backfill posture, **and** the fix self-heals: an already-`COMPLETED` orphaned expense is `isLocked: true`, so all three mutation paths refuse it with `EXPENSE_LOCKED` 409 and `recomputeAndPersist` is never reached. The moment the creator calls `unlockExpense` (status → `PENDING`, splits deleted), the next `reportItem` recomputes under the new rule and lands on an honest `MISMATCH`. (a) would convert silent corruption into a hard 500-class failure on a path the user cannot escape — strictly worse. Optional owner-run detection query, **not** scripted here: `SELECT i."expenseId" FROM "ExpenseItem" i JOIN "Expense" e ON e.id = i."expenseId" WHERE e."splitType" = 'COLLECTIVE' AND NOT (i."userId" = ANY(e."participantIds"));` |
| ADR-16 | Membership validation: explicit vs reconstructed (item 4) | New private `assertActiveMembers(groupId, userIds)` in `expense.service.js`. `computeSplits` gains a 6th parameter — an options object `{ participantIdsAreCallerProvided = true } = {}`, **defaulting to `true` (fail-closed)**. EQUAL validates only when the flag is true; PERCENTAGE validates unconditionally (unchanged behavior) | (a) Validate unconditionally in both branches, no new parameter; (b) validate in the callers before `computeSplits`; (c) a third inline copy in the EQUAL branch | (b) duplicates the call in two callers and puts EQUAL's validation outside the function that owns EQUAL's membership semantics. (c) is the duplication this change exists to delete. (a) **is provably safe today** — the reconstructed list is `activeExistingSplits.map(s => s.userId)` (L656) and `activeExistingSplits` is pre-filtered to active members at L649, so validating it always passes — **but that proof is non-local**: it depends on a filter 60 lines away staying in place. Delete L649's filter and `PUT { amount }` starts returning 400 on every expense with a departed participant. Per the brief, the distinction is made **explicit in the signature** rather than inferred. The `= true` default is the safety property: a future caller that forgets the option gets validation, not silence. |
| ADR-17 | Where the flag is set (ADR-16, mechanics) | `let participantIdsAreCallerProvided = true;` declared alongside `effectiveParticipantIds` (L584-585); flipped to `false` on the **line immediately after** `effectiveParticipantIds = reconstructedParticipantIds;` (L675) | Compute it at the call site as `!needsParticipantReconstruction` | `needsParticipantReconstruction` is block-scoped inside the `else` at L596-701 and is **not in scope** at the `computeSplits` call (L703) — using it there requires hoisting, which puts the flag's definition and the value it describes in two places that can drift. Setting it on the same line that overwrites the value makes drift mechanically impossible. |
| ADR-18 | `assertActiveMembers`' error message | Verbatim: `` `User ${userId} is not an active group member` ``, iterating `userIds` in order | A multi-ID aggregate message | Byte-identical to the current PERCENTAGE loop (L108). PERCENTAGE calls it as `assertActiveMembers(groupId, filteredSplits.map((s) => s.userId))`, preserving iteration order — so when several IDs are invalid the **same** one still appears in the message. `expense.service.test.js` L323 stays green with zero edits, which is the proof the PERCENTAGE refactor is behavior-preserving. Early-returns on an empty/nullish list. |
| ADR-19 | Query cost of item 4 | Accept one extra `getActiveMemberIds` query on the EQUAL-with-explicit-participantIds path | Cache active members across the two branches | The query is now **load-bearing**, not wasted — the opposite of Cycle 1's third-addendum Fix 2, which removed a query pair whose result `computeSplits` discarded for EQUAL. **Fix 2's `effectiveSplitType !== 'EQUAL'` gate (L621) is untouched by items 4 and 5** and must stay the first conjunct. |
| ADR-20 | Item 5 — exact diff | `needsSplitsReconstruction`'s second conjunct only. **Before**: `effectiveSplitType !== 'EQUAL' && effectiveSplitsInput === undefined` → **After**: `effectiveSplitType !== 'EQUAL' && (!effectiveSplitsInput \|\| effectiveSplitsInput.length === 0)` | Also normalize the `effectiveSplitsInput ?? []` on the COLLECTIVE branch (L595) | Byte-for-byte the shape of `participantIdsNotProvided` at L609-610. The `!== 'EQUAL'` gate stays the **first** conjunct so EQUAL still short-circuits before the array test (ADR-19). L595 is the COLLECTIVE dead-end that always throws `INVALID_SPLITS` — normalizing it changes nothing and touches the comment block Cycle 1 wrote to explain why it is deliberate. |
| ADR-21 | Item 6 — the transaction | Replace the bare `prisma.group.delete` (L277) with `await prisma.$transaction(async (tx) => { await tx.period.deleteMany({ where: { groupId } }); await tx.group.delete({ where: { id: groupId } }); });`. Preconditions (L241-275) stay **outside**, unchanged | (a) Keep it sequential, no transaction; (b) move the preconditions inside too | `deleteGroup` has **no `$transaction` today** — confirmed, four sequential reads then one bare delete. Without one, the two deletes are separate transactions: an explicit `period.deleteMany` that commits and *then* fails on `group.delete` would leave a group with zero periods, which `createExpense` L190-192 turns into a permanent `NOT_FOUND` 400 for that group. (b) is Cycle 2 ADR-6 / the proposal's explicit out-of-scope item; adding it would create a 7th atomic-guard call site and force item 7 to move first (the proposal's conditional fork). It does not. |
| ADR-22 | **Does the explicit delete actually change lock order, or does FK-cascade mechanics make it a no-op?** (item 6, verified not assumed) | **It genuinely reverses the order. Not a no-op.** | — | The brief is right to doubt the finalClosure mirror: finalClosure is update-then-update, `deleteGroup` is delete-with-cascade. Verified against Postgres RI mechanics, and **the structural difference does not break the transfer**. `ON DELETE CASCADE` is implemented as an **`AFTER ROW` referential-integrity trigger** (`RI_FKey_cascade_del`) on the referenced table. Postgres cannot fire an `AFTER ROW` trigger before the row operation that queues it, so `DELETE FROM "Group" WHERE id = $1` **must** lock and delete the `Group` tuple *first*, and only then issue the implicit `DELETE FROM "Period" WHERE "groupId" = $1`. Today's order is therefore strictly **Group → Period**. Issuing `tx.period.deleteMany` as a prior statement of the same transaction takes the `Period` row locks and **holds them to commit**, so by the time the `Group` row lock is requested we already hold `Period`: **Period → Group**, same direction as `finalClosure`. The documented `40P01` 2-cycle between the two paths is closed. |
| ADR-23 | Is the cascade now redundant or conflicting? (ADR-22 follow-up) | **Neither. Keep it, and it is load-bearing, not just a net.** | Remove `onDelete: Cascade` from `Period.groupId` | After `tx.period.deleteMany({ where: { groupId } })` the cascade trigger finds **zero rows** on the common path — a genuine no-op, no conflict, no double-delete error. But under `READ COMMITTED` another transaction can insert and commit a `Period` for this group **between** our two statements; the cascade is what deletes it, and *that* row is taken in Group→Period order. So the cascade still covers a real window (it is also the proposal's out-of-scope precondition-staleness class). Removing it is a schema change this code-only change forbids. |
| ADR-24 | New lock acquisitions introduced by ADR-21 (verified side effect) | **Accept and document.** No new guard | — | `Expense.periodId` and `Payment.periodId` are `onDelete: SetNull` (`schema.prisma` L206, L119), so `tx.period.deleteMany` fires `RI_FKey_setnull_del` → `UPDATE "Expense"/"Payment" SET "periodId" = NULL`. These rows exist: the preconditions count only `deletedAt: null` (L253, L266), so **soft-deleted** expenses/payments survive to this point and are now locked *before* `Group` instead of after. New full order: `Period → (Expense, Payment via SET NULL) → Group → (GroupMember, Expense, Payment, …)`. The only path taking `Expense`/`Payment` locks against `Period` is `createExpense`'s INSERT, whose FK-check locks (`FOR KEY SHARE` on both `Period` and `Group`) fire in unspecified trigger order **within one statement** — a theoretical cycle that exists **identically today** and is not controllable from application code. Pre-existing, unchanged by this item, explicitly out of scope. |
| ADR-25 | Item 6's stale comment | Delete `closure.service.js` L425-429 in the **same commit**, replacing it with a one-line pointer to this design's lock-order section | Leave it; clean up later | It asserts "the real fix belongs to deleteGroup and is out of scope here" — the moment PR 4 merges that is a lie, and a lie inside a lock-order comment is how the next reader reintroduces the inversion. |
| ADR-26 | Item 7 — `assertAtomicTransition` signature | `export async function assertAtomicTransition(delegate, { where, data, errorCode, errorMessage })` → `Promise<void>`. `409` hardcoded. Throws on `count !== 1` | (a) `(tx, modelName, …)` string pair; (b) return the `count`; (c) parameterize the status | Confirmed against all 6 sites. Passing the **delegate** (`tx.period`) needs no change to the shared Prisma mock and has no dynamic property access to get wrong. (b) invites callers to re-branch on a value that is already asserted to be exactly 1 — the whole point is that there is no other outcome. (c) is false generality: all six are lost races, all six are 409. `count !== 1` (not `=== 0`) is kept verbatim so a future caller with a non-unique `where` is also caught. |
| ADR-27 | What varies across the 6 sites (ADR-26, verified) | `where` and `data` pass through **whole**, untouched | Parameterize `id` + `status` and build `where` inside the helper | The six `where` clauses are **not** uniform: the four closure sites are `{ id, status }`, the two payment sites are `{ id, status, deletedAt: null }`. Building `where` inside the helper would silently drop payments' soft-delete predicate — a real regression, since a soft-deleted PENDING payment would become acceptable again. Pass-through is the only safe shape. `data`: five distinct objects. `errorCode`: `CLOSURE_BLOCKED` ×4, `NOT_PENDING` ×2. `errorMessage`: three distinct strings. All stay per-call-site → **zero API-contract change**. |
| ADR-28 | Item 7's acceptance bar | **`closure-concurrency.test.js`, `payment-concurrency.test.js`, `concurrency-barrier.test.js` and `soft-delete-filters.test.js` must pass with a ZERO-LINE diff.** Needing to edit even one assertion means the extraction changed behavior → revert, do not adapt the test | "Add new tests for the helper and update the old ones as needed" | This is the acceptance *bar*, not a test-coverage goal. It holds mechanically: the helper invokes the **same** `tx.period.updateMany` / `tx.payment.updateMany` on the **same** mock object with the **same** arguments, so `toHaveBeenCalledWith`, `not.toHaveBeenCalled` and `invocationCallOrder` are all blind to the extraction. Any failure is therefore evidence of a real behavioral delta, and adapting the test would erase that evidence. `concurrency-barrier.js` is reused **unmodified** (proposal dependency). |
| ADR-29 | Scope of the new helper concurrency suite | Narrow: per-site barrier double-fire + ADR-13 structural assertions **only where Cycle 2 does not already assert at that granularity** — guard-before-`period.create` (partialClosure), guard-before-`group.update` (finalClosure), guard-before-follow-up-`findUnique` (startClosure, completeClosure, accept, reject) | Re-derive Cycle 2's full matrix against the helper | ADR-28 means Cycle 2's suites **are** the six-site regression proof; re-asserting them would be ~250 duplicated lines and would push PR 5 over budget for zero marginal signal. The genuinely new assertion is that the helper is still **statement #1** at the two sites where a second write exists, and that no inline `updateMany` + `count` pair survives anywhere. |
| ADR-30 | Mock extensions | Extend `src/lib/__mocks__/prisma.js`: add `group.delete`, `period.deleteMany` (item 6) and `expenseItem.findUnique`/`update`/`delete` (items 2-3). Extend, never redefine | Bespoke inline mocks per test file | The file's own stated convention (L15-17). Carry the additions in the PR that first needs them. |

## Data Flow

### Item 3 — the two sums, before and after

```
  BEFORE (the bug)                           AFTER (ADR-10)
  ────────────────                           ──────────────
  expense.items  (ALL items)                 expense.items
       │                                          │
       ├──────────────┐                           ▼  Set(participantIds).has(i.userId)
       ▼              ▼                      participantItems  ◄── ONE derived set
  itemsSum       generateSplits                   │
  (inclusive)         │                           ├──────────────┐
       ▼              ▼                           ▼              ▼
  computeCollective   calculateCollectiveSplits   itemsSum   generateSplits
  Status              iterates participantIds     │              │
       │              → DROPS the orphan          ▼              ▼
       ▼                     │              computeCollective  calculateCollectiveSplits
  'COMPLETED'  ✗  ◄── 150    ▼                 Status          → nothing to drop
                      splits = 100              │                    │
                             │                  ▼                    ▼
                      PERSISTED SILENTLY   'MISMATCH' ✔        assertSplitsSumToTotal
                      payer short 50                            (ADR-12) ✔
```

Repro from the discovery — total 150, `sharedCosts` 0, `participantIds [A,B]`, items A=50 B=50
orphan D=50: `itemsSum` becomes 100, `computeCollectiveStatus(100, 0, 150)` → `MISMATCH`, no splits
are generated, the expense stays unlocked and honest. D's orphan row remains but is **inert**, and
ADR-9's `NOT_PARTICIPANT` can safely be added.

### Item 4 — which participant list gets validated

```
  updateExpense
       │
       ├─ data.participantIds non-empty? ──YES──► effectiveParticipantIds = data.participantIds
       │                                          participantIdsAreCallerProvided = true  (initial)
       │                                                        │
       └─ NO ──► reconstruct from persisted splits                     │
                 (already filtered to ACTIVE members, L649)            │
                 effectiveParticipantIds = reconstructed               │
                 participantIdsAreCallerProvided = false  ◄── ADR-17   │
                               │                                       │
                               └───────────────┬───────────────────────┘
                                               ▼
                                computeSplits(..., { participantIdsAreCallerProvided })
                                               │
                        EQUAL branch ──────────┤────────── PERCENTAGE branch
                        flag true?                         always validates
                         ├─ yes → assertActiveMembers       assertActiveMembers(
                         └─ no  → skip                        groupId,
                                                              filteredSplits.map(s => s.userId))
```

`createExpense` passes **no** options object → default `true` → always validates (there is no
reconstruction concept there; `participantIds` is always caller-provided).

### Item 6 — lock order

```
  BEFORE                                  AFTER (ADR-21/22)
  ──────                                  ─────────────────
  prisma.group.delete({ id })             $transaction:
    1. lock+delete Group row                1. tx.period.deleteMany({ groupId })
    2. AFTER-ROW RI trigger fires              → locks Period rows (held to COMMIT)
       → delete Period rows                    → SET NULL on soft-deleted
                                                  Expense/Payment (ADR-24)
  = Group ──► Period                        2. tx.group.delete({ id })
    INVERSE of finalClosure                      → locks Group; Period cascade = no-op
    → 40P01 cycle                         = Period ──► Group   SAME as finalClosure ✔
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/frontend/src/utils/expensePermissions.js` | **Create** | `canEditExpense` / `canDeleteExpense` / `canUnlockExpense`, pure, `(expense, group, currentUserId)` (ADR-1/2/3) |
| `apps/frontend/src/utils/__tests__/expensePermissions.test.js` | **Create** | Truth table: creator / payer-not-creator / group-owner / unrelated × 3 actions, plus `canUnlockExpense`'s splitType + status rows |
| `apps/frontend/src/pages/GroupDetailPage.jsx` | Modify | L1091-1094: delete `isCreator`, call the three helpers. L1151 / L1161 / L1192 gates. L1196-1202: `catch (err) { alert(…) }` + `loadGroup()` (ADR-4) |
| `apps/backend/src/services/item-reporting.service.js` | Modify | `deletedAt` guards: `reportItem` after L32, `updateItem` after L92, `deleteItem` after L135, `getItemStatus` after L242 (ADR-5/6/8); `recomputeAndPersist` L166 widened (ADR-7). `NOT_PARTICIPANT` after L96 / L139 (ADR-9). `participantItems` filter in `recomputeAndPersist` L170 + `getItemStatus` L244 (ADR-10/14). `generateSplits` gains `totalAmount` and calls `assertSplitsSumToTotal` (ADR-12) |
| `apps/backend/src/utils/splits.js` | Modify | **New export** `assertSplitsSumToTotal(splits, totalAmount)` (ADR-12). `calculateCollectiveSplits` untouched |
| `apps/backend/src/utils/__tests__/splits.test.js` | Modify | Unit tests for `assertSplitsSumToTotal`: sums → passes, off by >0.01 → `VALIDATION_ERROR` 400, within 0.01 → passes |
| `apps/backend/src/services/expense.service.js` | Modify | `createExpense` orphan-item rejection after L231 (ADR-13). New private `assertActiveMembers` near L66 (ADR-16/18). `computeSplits` 6th param + EQUAL/PERCENTAGE call sites L83-116; L126-129 → `assertSplitsSumToTotal` (ADR-12/16). `updateExpense`: flag declaration at L584-585, flip after L675 (ADR-17), options arg at L703-709. `needsSplitsReconstruction` L620-621 (ADR-20) |
| `apps/backend/src/services/group.service.js` | Modify | `deleteGroup` L277 → `$transaction` with `tx.period.deleteMany` first (ADR-21) |
| `apps/backend/src/services/__tests__/group.service.test.js` | **Create** | No test file exists for this service. Preconditions still refuse; `invocationCallOrder` proves `period.deleteMany` before `group.delete`; both inside `$transaction` |
| `apps/backend/src/services/closure.service.js` | Modify | Delete the stale L425-429 comment (ADR-25). Four guards → `assertAtomicTransition` (item 7) |
| `apps/backend/src/utils/transitions.js` | **Create** | `assertAtomicTransition(delegate, { where, data, errorCode, errorMessage })` (ADR-26/27) |
| `apps/backend/src/utils/__tests__/transitions.test.js` | **Create** | `count: 1` resolves; `0` and `2` throw the caller's code at 409; `where`/`data` forwarded verbatim |
| `apps/backend/src/services/payment.service.js` | Modify | Two guards → `assertAtomicTransition`, `deletedAt: null` preserved in `where` (ADR-27) |
| `apps/backend/src/services/__tests__/transition-helper-concurrency.test.js` | **Create** | Narrow scope per ADR-29; reuses `concurrency-barrier.js` unmodified |
| `apps/backend/src/lib/__mocks__/prisma.js` | Modify | Add `group.delete`, `period.deleteMany`, `expenseItem.findUnique`/`update`/`delete` (ADR-30) |
| `apps/backend/src/utils/errors.js` | Modify | Docblock only: register `INVALID_PARTICIPANTS`, `EXPENSE_LOCKED`, `INVALID_SPLIT_TYPE` |
| `.../closure-concurrency.test.js`, `payment-concurrency.test.js`, `concurrency-barrier.test.js`, `soft-delete-filters.test.js` | **Unchanged — contract** | ADR-28. A required edit means the extraction is wrong |
| `apps/backend/src/services/__tests__/concurrency-barrier.js` | **Unchanged** | Reuse only |
| `apps/backend/prisma/schema.prisma` | **Unchanged** | No migration. `Period.onDelete: Cascade` stays (ADR-23) |

## Interfaces / Contracts

### Item 1 — `apps/frontend/src/utils/expensePermissions.js`

```js
/**
 * Expense action permissions — pure 1:1 transcriptions of the backend rules in
 * `apps/backend/src/services/expense.service.js`. If a rule changes there, it
 * MUST change here in the same commit: a button that renders for a user the
 * backend will refuse is the drift this module exists to prevent.
 */

/** Backend: updateExpense L546 — payer OR creator OR group owner. */
export function canEditExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return (
    expense.payerId === currentUserId ||
    expense.createdById === currentUserId ||
    group?.ownerId === currentUserId
  );
}

/** Backend: deleteExpense L806-815 — creator OR group owner. NO payer. */
export function canDeleteExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return expense.createdById === currentUserId || group?.ownerId === currentUserId;
}

/**
 * Backend: unlockExpense L848-859 — COLLECTIVE *and* creator-only *and*
 * COMPLETED. All three gates, not just the authorization one (ADR-2).
 * `group` is unused; kept for uniform arity across this module.
 */
export function canUnlockExpense(expense, group, currentUserId) {
  if (!expense || !currentUserId) return false;
  return (
    expense.splitType === 'COLLECTIVE' &&
    expense.createdById === currentUserId &&
    expense.status === 'COMPLETED'
  );
}
```

### Item 3 — `recomputeAndPersist` (replaces L166-184)

```js
  if (!expense || expense.deletedAt !== null || expense.splitType !== 'COLLECTIVE') {
    return null;                                             // ADR-7
  }

  // ONE derived set feeds BOTH the status computation and split generation.
  // An item whose owner is no longer in `participantIds` is already DROPPED by
  // calculateCollectiveSplits (splits.js L160-161); counting it here is what
  // let a COMPLETED expense persist splits that miss the total. See ADR-10 and
  // Engram `discovery/orphaned-collective-items-split-sum`.
  const participantSet = new Set(expense.participantIds);
  const participantItems = expense.items.filter((i) => participantSet.has(i.userId));

  const itemsSum = participantItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const sharedCosts = Number(expense.sharedCosts) || 0;
  const total = Number(expense.amount);

  const newStatus = computeCollectiveStatus(itemsSum, sharedCosts, total);

  if (newStatus === 'COMPLETED') {
    await prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id: expenseId },
        data: { status: 'COMPLETED', isLocked: true },
      });
      await generateSplits(tx, expenseId, participantItems, sharedCosts, expense.participantIds, total);
    });
  } else { /* … MISMATCH, unchanged … */ }
```

### Item 3 — `assertSplitsSumToTotal` in `utils/splits.js` (ADR-12)

```js
/**
 * Assert that generated splits sum to the expense total (±0.01).
 *
 * Extracted from expense.service.js's computeSplits (Cycle 1 ADR-6) so EVERY
 * split-generating path carries the same backstop — the COLLECTIVE path had
 * none, which is how orphaned items silently under-split a COMPLETED expense.
 * Deliberately a REJECT, not a rescale: reinterpreting how much each person
 * owes is a money decision the server must not make unilaterally.
 *
 * @throws {AppError} VALIDATION_ERROR 400
 */
export function assertSplitsSumToTotal(splits, totalAmount) {
  const computedTotal = (splits || []).reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(computedTotal - totalAmount) > 0.01) {
    throw new AppError('VALIDATION_ERROR', 400, 'Split amounts must sum to expense amount');
  }
}
```

`generateSplits` calls it between `calculateCollectiveSplits` and `createMany`; `createExpense`'s
inline block calls it after L276; `computeSplits` L126-129 becomes
`assertSplitsSumToTotal(calculatedSplits, totalAmount);` — identical code, status and message.

### Item 4 — `assertActiveMembers` + `computeSplits` (ADR-16/17/18)

```js
async function assertActiveMembers(groupId, userIds) {
  if (!userIds || userIds.length === 0) return;
  const activeMemberSet = new Set(await getActiveMemberIds(groupId));
  for (const userId of userIds) {
    if (!activeMemberSet.has(userId)) {
      throw new AppError('INVALID_PARTICIPANTS', 400, `User ${userId} is not an active group member`);
    }
  }
}

async function computeSplits(
  totalAmount, splitType, splits, groupId, participantIds,
  // Fail-closed default: a new caller that forgets this option gets
  // validation, not silence. Only updateExpense's reconstruction path
  // passes `false`. See ADR-16.
  { participantIdsAreCallerProvided = true } = {},
) {
  validateSplits(totalAmount, splitType, splits);
  let calculatedSplits;

  if (splitType === 'EQUAL') {
    let memberIds;
    if (participantIds && participantIds.length > 0) {
      // Item 4: the EQUAL branch previously accepted ANY list with zero
      // validation while PERCENTAGE below validated every id. Validate ONLY a
      // caller-supplied list — a list reconstructed from persisted splits is
      // already active-filtered (updateExpense L649), and 400-ing a
      // `PUT { amount }` because a participant left months ago would break
      // editing for every historical expense.
      if (participantIdsAreCallerProvided) {
        await assertActiveMembers(groupId, participantIds);
      }
      memberIds = participantIds;
    } else {
      memberIds = await getActiveMemberIds(groupId);
    }
    calculatedSplits = calculateEqualSplits(totalAmount, memberIds);
  } else if (splitType === 'PERCENTAGE') {
    let filteredSplits = splits;
    if (participantIds && participantIds.length > 0) {
      const participantSet = new Set(participantIds);
      filteredSplits = splits.filter((s) => participantSet.has(s.userId));
      // Same validator, same message, same iteration order as the inline loop
      // it replaces (ADR-18) — zero behavior change for PERCENTAGE.
      await assertActiveMembers(groupId, filteredSplits.map((s) => s.userId));
    }
    calculatedSplits = calculatePercentageSplits(totalAmount, filteredSplits);
  } else {
    throw new AppError('INVALID_SPLITS', 400, 'Unknown split type');
  }

  assertSplitsSumToTotal(calculatedSplits, totalAmount);   // ADR-12
  return calculatedSplits;
}
```

### Item 6 — `deleteGroup` tail (replaces L277)

```js
  // Period BEFORE Group — same direction as finalClosure (closure.service.js
  // L430-447). `prisma.group.delete` alone takes Group then Period: the
  // ON DELETE CASCADE is an AFTER-ROW RI trigger, so Postgres necessarily
  // locks and deletes the Group tuple before the implicit Period delete can
  // run. Deleting Periods in a prior statement of the SAME transaction holds
  // their locks to commit, so Period is genuinely acquired first. The cascade
  // stays as a net for a Period committed by another transaction between
  // these two statements. See design.md ADR-21/22/23/24.
  await prisma.$transaction(async (tx) => {
    await tx.period.deleteMany({ where: { groupId } });
    await tx.group.delete({ where: { id: groupId } });
  });
```

### Item 7 — `apps/backend/src/utils/transitions.js` (ADR-26/27)

```js
import { AppError } from './errors.js';

/**
 * Atomic state-transition guard — the Cycle 2 pattern, extracted verbatim.
 *
 * Moves the state predicate INTO the `where` of an `updateMany` so a caller
 * that lost the race writes nothing and `count` is 0. READ COMMITTED
 * re-evaluates a blocked UPDATE's WHERE against the newly committed row, which
 * is what makes this authoritative where a `SELECT` + `if` is not.
 *
 * MUST be the FIRST statement of its transaction at every call site (Cycle 2
 * ADR-4: Period before Group). 409 is hardcoded — all six call sites are lost
 * races. `where` and `data` pass through WHOLE: the payment sites carry a
 * `deletedAt: null` predicate the closure sites do not (ADR-27).
 *
 * @param {object} delegate — a Prisma MODEL delegate, e.g. `tx.period`
 * @param {{ where: object, data: object, errorCode: string, errorMessage: string }} opts
 * @returns {Promise<void>}
 * @throws {AppError} `errorCode` at 409 when exactly one row was not updated
 */
export async function assertAtomicTransition(delegate, { where, data, errorCode, errorMessage }) {
  const guard = await delegate.updateMany({ where, data });
  if (guard.count !== 1) {
    throw new AppError(errorCode, 409, errorMessage);
  }
}
```

Retrofit (all six sites collapse to one `await`); `finalClosure` shown:

```js
  return prisma.$transaction(async (tx) => {
    await assertAtomicTransition(tx.period, {
      where: { id: period.id, status: 'CLOSING' },
      data: { status: 'FINAL', isCurrent: false, closedAt: new Date() },
      errorCode: 'CLOSURE_BLOCKED',
      errorMessage: 'Period is no longer in CLOSING status',
    });
    await tx.group.update({ where: { id: groupId }, data: { status: 'CLOSED' } });
    return tx.period.findUnique({ where: { id: period.id } });
  });
```

| Site | delegate | `where` | `errorCode` / message |
|------|----------|---------|----------------------|
| `startClosure` L185 | `tx.period` | `{ id, status: 'OPEN' }` | `CLOSURE_BLOCKED` / "no longer in OPEN status" |
| `completeClosure` L255 | `tx.period` | `{ id, status: 'CLOSING' }` | `CLOSURE_BLOCKED` / "no longer in CLOSING status" |
| `partialClosure` L343 | `tx.period` | `{ id, status: 'CLOSING' }` | `CLOSURE_BLOCKED` / same |
| `finalClosure` L430 | `tx.period` | `{ id, status: 'CLOSING' }` | `CLOSURE_BLOCKED` / same |
| `acceptPayment` L304 | `tx.payment` | `{ id, status: 'PENDING', deletedAt: null }` | `NOT_PENDING` / "Payment is not in PENDING status" |
| `rejectPayment` L375 | `tx.payment` | `{ id, status: 'PENDING', deletedAt: null }` | `NOT_PENDING` / same |

## Testing Strategy

Strict TDD. `pnpm --filter backend test && pnpm --filter frontend test`. One failing test precedes
every fix. No `setTimeout` in any new test.

| Layer | What to test | Approach |
|-------|-------------|----------|
| Unit — frontend | Truth table: creator / payer-not-creator / group-owner / unrelated × edit/delete/unlock; `canUnlockExpense` false for non-COLLECTIVE and for non-COMPLETED | Pure function, no mocks (`utils/payments.test.js` precedent) |
| Unit — frontend | Unlock 403 surfaces: `expenseService.unlockExpense` rejects → `alert` called with the backend message | `vi.spyOn(window, 'alert')` |
| Unit — `splits.js` | `assertSplitsSumToTotal`: exact, within 0.01, off by >0.01 → `VALIDATION_ERROR` 400, empty/nullish | Direct pure-function test |
| Unit — item-reporting | All 4 of `reportItem`/`updateItem`/`deleteItem`/`getItemStatus` → `EXPENSE_NOT_FOUND` 404 on `deletedAt !== null`, **and no mutation is attempted**; `recomputeAndPersist` returns `null` and calls no `update` | Shared prisma mock; `expect(prisma.expenseItem.upsert).not.toHaveBeenCalled()` |
| Unit — item-reporting | `NOT_PARTICIPANT` 403 from `updateItem`/`deleteItem` for the item's own owner once removed from `participantIds`; the 403 precedes `EXPENSE_LOCKED` (set `isLocked: true` **and** remove the participant → expect 403) | Shared prisma mock |
| Unit — item-reporting | **The money bug**: the discovery's exact repro (150 / [A,B] / A=50 B=50 D=50) → status `MISMATCH`, `expenseSplit.createMany` **not** called, `expense.update` called with `isLocked: false` | Shared prisma mock; this is the regression test for ADR-10 |
| Unit — item-reporting | `getItemStatus` excludes the orphan: `itemsSum` 100 and `discrepancy` −50, not 150 / 0 | Shared prisma mock |
| Unit — expense | `createExpense` COLLECTIVE with an item outside `participantIds` → `INVALID_PARTICIPANTS` 400, nothing created (ADR-13) | Shared prisma mock |
| Unit — expense | EQUAL `participantIds` with a non-member / departed member → `INVALID_PARTICIPANTS` 400, for **both** `createExpense` and `updateExpense` | Shared prisma mock |
| Unit — expense | **The ADR-16 exception**: `PUT { amount }` on an EQUAL expense whose persisted splits include a departed member → **succeeds** (reconstructed list is not validated) | Sequence `expenseSplit.findMany` + `groupMember.findMany` |
| Unit — expense | PERCENTAGE's existing `INVALID_PARTICIPANTS` test (L323) and sum-guard test (L93) pass **unedited** — proof the refactor is behavior-preserving | Existing suite |
| Unit — expense | `PUT { amount, splits: [] }` on PERCENTAGE reconstructs and succeeds (was `INVALID_SPLITS` 400); EQUAL + explicit `participantIds` still skips the `expenseSplit.findMany`/`getActiveMemberIds` pair (Fix 2 gate) | `expect(prisma.expenseSplit.findMany).not.toHaveBeenCalled()` |
| Unit — group | `deleteGroup` runs inside `$transaction`; `invocationCallOrder` proves `period.deleteMany` < `group.delete`; preconditions still 409 before the transaction opens | New `group.service.test.js` |
| Unit — transitions | `count: 1` resolves; `0` and `2` throw the caller's `errorCode` at 409; `where`/`data` forwarded verbatim including `deletedAt: null` | Fake delegate `{ updateMany: vi.fn() }` |
| Concurrency — item 7 | Barrier double-fire at each of the 6 retrofitted sites → 1 fulfilled + 1 409 with the site's own code; helper is statement #1 (ADR-29) | `concurrency-barrier.js`, **unmodified** |
| **Regression contract** | `closure-concurrency.test.js`, `payment-concurrency.test.js`, `concurrency-barrier.test.js`, `soft-delete-filters.test.js` green with a **zero-line diff** (ADR-28) | Existing suites |
| Not covered | Real Postgres lock ordering / actual `40P01`; SQL-level atomicity | Accepted, same as Cycle 2 ADR-13. State it in each new test file's header |

## Migration / Rollout

**No migration required.** No schema change, no new error code, no data mutation, no backfill
(ADR-15). Code-only, pure-revert, five independent reverts.

1. Items 1-6 share no code with each other except `assertSplitsSumToTotal`, introduced in PR 2 and
   consumed by PR 3 — a clean one-directional dependency in a stacked chain.
2. Item 7 reverts to the six inline guards with their original bodies; because the extraction is
   behavior-preserving, the revert is too.
3. Reverting item 6 restores the Group→Period cascade order and with it the narrow `40P01` window
   Cycle 2 accepted as harmless. Any group already deleted stays deleted — the cascade did the same
   work.
4. **ADR-10/12/13 is the only money math in this change.** It must be verified before merge, not
   after: run the discovery's exact repro against the real stack, confirm `MISMATCH` and zero
   persisted splits. Optional: the ADR-15 detection query, to learn whether any orphan exists today.
5. Post-merge verification: `pnpm --filter backend test && pnpm --filter frontend test && pnpm -r run build`,
   then grep `closure.service.js` / `payment.service.js` for any surviving `updateMany` + `count !== 1`
   pair, and `GroupDetailPage.jsx` for any surviving `isCreator`.

## Review Budget / Delivery

| Slice | Items | Prod | Tests | Total |
|-------|-------|-----:|------:|------:|
| **PR 1** — frontend permissions | 1 | ~75 | ~130 | **~205** |
| **PR 2** — item-reporting + the sum guard | 2, 3 *(item-reporting half)* | ~70 | ~230 | **~300** |
| **PR 3** — expense.service | 4, 5, 3 *(createExpense half)* | ~75 | ~255 | **~330** |
| **PR 4** — deleteGroup lock order | 6 | ~25 | ~95 | **~120** |
| **PR 5** — assertAtomicTransition | 7 | ~85 | ~255 | **~340** |
| | | **~330** | **~965** | **~1295** |

**Chained PRs recommended: Yes. 400-line budget risk: Medium. Decision needed before apply: Yes.**

`stacked-to-main`, five PRs, every slice under 400.

**Re-slice vs. the proposal (the brief asked me to re-check this).** Item 3's expanded scope (ADR-10
+ ADR-12 + ADR-13) spreads it across three files — `item-reporting.service.js`, `utils/splits.js`
**and** `expense.service.js` — so the proposal's "PR 2 = items 2+3, one service file" no longer
holds: as written it reaches ~355 and overlaps PR 3's file. **Re-slice by file, not by item number**:
PR 2 takes item 3's `item-reporting.service.js` + `splits.js` half, PR 3 takes its `expense.service.js`
half alongside items 4 and 5. Each half is independently correct and independently revertible — PR 2
fixes the recompute path, PR 3 fixes the create path, neither depends on the other for correctness.
This restores one-service-file-per-PR and rebalances ~355/~275 to ~300/~330.

**Item 6's cascade finding does not change its size** (ADR-22 confirmed the fix transfers; the
finding is design rationale, not extra code). **PR 5 is the tightest at ~340** — ADR-29's narrow
suite scope is what keeps it under budget; re-deriving Cycle 2's full matrix would add ~250 lines
and blow it.

**Item 7 stays LAST.** Re-verified against the final design: items 1-6 introduce **zero** new
atomic-guard call sites — items 1-5 are permission/validation checks, and ADR-21's `deleteGroup`
transaction has no status predicate and no `updateMany`+`count` pair. The proposal's conditional
fork (atomic `deleteGroup` preconditions → item 7 moves first) is **not triggered**.

## Open Questions

- [ ] **ADR-13 — `createExpense` orphan-item rejection is an API behavior change.** Found during
      this design, not in the proposal. `POST` with an `items[]` entry outside `participantIds`
      currently returns 200 with silently wrong splits; it would now return `INVALID_PARTICIPANTS`
      400. **Owner confirmation needed.** If declined, the fallback is ADR-13 alternative (a) —
      silently exclude, mirroring ADR-10 — which fixes the money but creates a permanently
      unremovable orphan at creation time. Recommendation: confirm the rejection.
- [ ] **Adjacent gap, found while designing item 4 — NOT designed here.** `computeSplits`'
      PERCENTAGE membership validation only runs inside the `if (participantIds && length > 0)`
      gate (L99). A PERCENTAGE request with explicit `splits` and **no** `participantIds` validates
      nothing — so a non-member can appear in `splits`. Same hole item 4 closes for EQUAL, one
      branch over. The fix is one line (hoist `assertActiveMembers` out of the gate) but it is
      another previously-200 → 400 change. **Owner's call whether to fold it into PR 3** or record
      it as a future item. Not in the proposal's scope; I did not design it in.
- [x] **Risk row 1 / option (b)** — **Resolved as designed**: ADR-10 (exclude non-participant items
      from every sum) + ADR-12 (portable sum guard) + ADR-14 (`getItemStatus` too) + ADR-13
      (reject at creation) + ADR-15 (forward-fix only).
- [x] **Item 6/7 ordering fork** — **Resolved: item 7 stays last.** No atomic precondition guard is
      being added to `deleteGroup`.
- [x] **Item 6 cascade-vs-explicit lock order** — **Resolved: the explicit delete genuinely
      reverses the order** (ADR-22). The `AFTER ROW` RI-trigger mechanic forces Group-first today;
      a prior statement in the same transaction holds Period's locks to commit.
- [ ] **Delivery** — confirm the 5-slice `stacked-to-main` chain with the PR 2/3 re-slice above.
      Formal resolution at `sdd-tasks`'s Review Workload Forecast.

## Out of Scope (do not design, do not implement here)

- Cascade-deleting orphan `ExpenseItem` rows when `updateExpense` shrinks `participantIds` (risk
  row 1 option (c), ADR-10 alternative) — the structurally cleanest fix; needs its own change
- Atomic `deleteGroup` preconditions / the read-then-delete staleness class (Cycle 2 ADR-6)
- The `createExpense`-INSERT vs `deleteGroup` FK-check-lock cycle (ADR-24) — pre-existing,
  not controllable from application code
- Authoritative persisted `participantIds` on `Expense` (Engram
  `architecture/expense-participantIds-authoritative-source`) — would supersede item 5
- Payment resolution for REJECTED payments (Engram
  `architecture/payment-rejection-resolution-concept`)
- Render deploy CI / migration gating — split out by owner decision during scoping
- Any behavior change to Cycle 2's guards (item 7 is a pure extraction, ADR-28)
- Real-Postgres concurrency harness; i18n of the `alert` strings (ADR-4)
