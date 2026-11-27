# Archive Report: Static Group Closures

**Change name**: static-group-closures
**Status**: COMPLETE
**Archive date**: 2026-11-26
**Original implementation date**: 2026-06-10 (per `tasks.md`'s own timestamps — all 73 tasks were already marked `[x]`)

## Executive summary

This is a retroactive archive of work that was already fully implemented on 2026-06-10 but never formally closed in SDD — it sat in `openspec/changes/` for over 5 months while 4 unrelated bug-cleanup cycles (`money-correctness-fixes`, `closure-concurrency-guards`, `permissions-and-process-cleanup`, `money-arithmetic-utility`) were planned, built, and archived around it. Two of those later cycles' own archive reports explicitly note they had to create fresh live specs (`payment-acceptance`, `period-management`) specifically *because* this change's specs were never merged — this archive finally closes that gap.

The underlying feature — the full STATIC-group period/closure state machine (OPEN→CLOSING→CLOSED/FINAL, partial reopen, owner-only transitions, PENDING-payment and zero-balance gating) and the payment accept/reject flow — is real, shipped, and has been the foundation every later cycle built concurrency guards and bug fixes on top of (`closure.service.js`, `period.service.js`, the `Period` Prisma model, payment `acceptPayment`/`rejectPayment`). No new code was written to close this archive; this is a specs/paperwork reconciliation only.

## Why this took a careful audit instead of a mechanical merge

A direct merge of this change's 6 delta spec files into the live tree would have been actively harmful: the June draft describes mechanisms that were later corrected or replaced by real code —
- A non-existent `Group.currentPeriodId` field (the real mechanism, shipped since, is `Period.isCurrent` plus a partial unique index).
- "REJECTED payments block STATIC closure" (corrected by `closure-concurrency-guards`'s own investigation to "REJECTED payments do NOT block closure" — confirmed via the actual code and a user-asked clarifying question during that cycle).
- A stale, DYNAMIC-blocking framing of payment acceptance (corrected by `money-correctness-fixes` to be mode-agnostic).

A fresh-context audit compared each of the 6 delta spec files against (a) the live spec tree and (b) the real current code before any merge was written, to avoid reintroducing already-fixed inaccuracies.

## Specs merged to the live tree (`openspec/specs/`)

| Capability | Action | What changed |
|------------|--------|---------------|
| `expense-management` | Modified | Added "Period-Scoped Expense Creation for STATIC Groups", "DYNAMIC Groups Unaffected by Period Logic"; extended "List Group Expenses" with `?periodId=`/`?includeHistory=true` |
| `historical-period-visibility` | **Created** | First live spec for this capability (5 requirements: list/get periods, get period expenses/payments, full expense-detail persistence) — corrected error code `FORBIDDEN`→`NOT_MEMBER` and removed a claimed single-expense-detail endpoint that doesn't exist |
| `payment-recording` | Modified | Added periodId auto-link + unconditional `PENDING` default to "Record Payment"; added "List Group Payments with Period Filter" |
| `period-management` | Modified | Added the base closure state machine (Create/Start/Complete/Partial/Final) alongside the existing concurrency-guard requirements from `closure-concurrency-guards`; corrected `Group.currentPeriodId`→`Period.isCurrent`, corrected "PENDING or REJECTED blocks completion"→"PENDING-only"; added the zero-balance precondition to Complete/Partial/Final (NOT Start — verified `startClosure` never calls `requireZeroBalances`, a deliberate deviation from this archive's own initial instruction, caught by checking the real code) |
| `balance-calculation` | Modified | Replaced a placeholder "Balance Mode Compatibility" requirement (which explicitly said STATIC closure behavior was "out of scope") with 6 real requirements; corrected a wrong "balances reset on closure" framing to the real "zero-balance precondition check, not a mutating action" |
| `payment-acceptance` | **Not touched** | Confirmed fully superseded by the already-correct live spec written during `money-correctness-fixes` and `closure-concurrency-guards` — the stale delta's accept/reject content directly contradicts shipped behavior and was dropped entirely |

## Deferred / not applicable

Nothing new deferred by this archive — all substantive gaps the June proposal identified were already addressed by the 4 cycles that ran around it. The one real gap this archive closes is documentation, not code.

## Final verification

No code was changed by this archive — verification is limited to spec-merge correctness:
- Every added requirement was checked against the actual service/route/schema code before writing (`period.service.js`, `closure.service.js`, `payment.service.js`, `expense.service.js`, `balance.service.js`, `prisma/schema.prisma`), not copied from the stale draft on faith.
- Confirmed no duplicate requirement headings were introduced in any of the 4 modified live spec files.
- The existing full test suite (101/101 backend, 52/52 frontend, confirmed as of `money-arithmetic-utility`'s archive) is unaffected, since no application code changed.

## Sign-off

No application code commits in this archive — this is a specs-only reconciliation. The underlying feature's original implementation predates this session and this project's current no-AI-attribution convention tracking; nothing here required a new commit with attribution risk beyond the archive commit itself, which was checked the same way as every other archive this session.

The `static-group-closures` change is archived. This closes a 5-month-old gap between real shipped functionality and its SDD paper trail — not new work, but work that was quietly load-bearing under every cycle since.
