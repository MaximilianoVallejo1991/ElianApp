# Verify Report - PR 3 (Phase 3): expense.service.js orphan rejection, membership validation, reconstruction fixes

Change: permissions-and-process-cleanup
Branch: fix/equal-membership-and-percentage-reconstruction (off main, which already has PR 1 + PR 2 merged)
Commits: 92d8e9e (fix), b0e4e6f (docs: tasks.md addendum) - not pushed, not merged
Scope discipline: ponytail - one small test per real case, not a combinatorial matrix. This review does not apply Cycle 1/2 heavier coverage bar.

## Verdict

CRITICAL: 0 | WARNING: 0 | SUGGESTION: 2

PR 3 is ready to push and open for human review.

## Test run (actual, not trusted from report)

pnpm --filter backend test   -> 7 test files, 88/88 passed
pnpm --filter frontend test  -> 4 test files, 50/50 passed

Matches the apply report claimed 88/50 exactly.

## Scope containment

git diff main...fix/equal-membership-and-percentage-reconstruction --stat:

apps/backend/src/lib/__mocks__/prisma.js                       |   4 +-
apps/backend/src/services/__tests__/expense.service.test.js    | 183 +++++++++-
apps/backend/src/services/expense.service.js                   |  79 ++++--
openspec/changes/permissions-and-process-cleanup/tasks.md      | 103 ++++---

Confirmed: no touch to item-reporting.service.js, group.service.js (deleteGroup), closure.service.js/payment.service.js (atomic-guard helper, item 7), or any frontend file. prisma.js mock change is a single added stub (expenseItem.createMany) plus a docblock line - infra only, not scope creep.

## Attribution check

git log main..HEAD - both commit messages inspected in full. No Co-Authored-By or AI attribution trailer in either commit.

## Scenario-to-test traceability (spec items 4 and 5)

### Item 4 - EQUAL Split Membership Validation

Scenario: Explicit non-member rejected on create
Test: createExpense - EQUAL membership validation (item 4, ADR-16) - participantIds: [u1,u2,u4], u4 not active -> INVALID_PARTICIPANTS 400
Code path traced: computeSplits EQUAL branch: participantIds.length > 0 -> participantIdsAreCallerProvided defaults true -> assertActiveMembers(groupId, participantIds) iterates and throws on u4. Confirmed by reading the code, not just the test name.

Scenario: Explicit non-member rejected on update
Test: Not independently tested - covered by the create-side test plus the shared-code-path argument explicit in tasks.md 3.3: updateExpense reaches the identical computeSplits call with the identical default participantIdsAreCallerProvided = true whenever the caller supplies a non-empty participantIds (traced: participantIdsNotProvided is false -> needsParticipantReconstruction is false -> effectiveParticipantIds stays the caller list, flag never flipped to false). This is a deliberate, documented ponytail choice, not an oversight - acceptable under this change testing philosophy.

Scenario: Reconstructed fallback for a departed member still succeeds
Test: (item 4, ADR-16 exception) PUT { amount } test - u2 removed from groupMember.findMany mock, persisted splits still reference u2
Code path traced: participantIdsNotProvided=true -> needsParticipantReconstruction=true -> activeExistingSplits filters persisted rows by getActiveMemberIds BEFORE computeSplits is ever called -> reconstructedParticipantIds = [u1] (u2 excluded) -> participantIdsAreCallerProvided flipped to false on the very next line -> computeSplits receives { participantIdsAreCallerProvided: false } -> EQUAL branch if (participantIdsAreCallerProvided) await assertActiveMembers(...) guard is skipped entirely. Confirmed both the validation-skip AND the pre-existing filter are doing the actual safety work (non-local proof, honestly flagged in tasks.md 3.5 and reproduced here).

### Item 5 - PERCENTAGE Splits Reconstruction (empty-array normalization)

Scenario: Empty splits array on PERCENTAGE update reconstructs instead of failing
Test: (item 5) PUT { amount, splits: [] } test - persisted 60/40 splits, asserts reconstructed create array with correct recomputed amounts
Code path traced: needsSplitsReconstruction = effectiveSplitType !== EQUAL && (!effectiveSplitsInput || effectiveSplitsInput.length === 0) - effectiveSplitsInput = [] -> ![] is false, but [].length === 0 is true -> reconstructs. Confirmed !== EQUAL stays the first (short-circuiting) conjunct as the spec requires.

Scenario: EQUAL update with empty splits array is unaffected
Test: Pre-existing (Second addendum regression - Bug 1) test, unedited, still passing
Code path traced: effectiveSplitType !== EQUAL is false for EQUAL -> whole conjunction short-circuits to false before the array-emptiness check ever runs -> no expenseSplit.findMany query pair fires; participantIds-driven path only.

Mirroring check - explicitly requested: participantIdsNotProvided = !effectiveParticipantIds || effectiveParticipantIds.length === 0 (existing, from PR 2) and needsSplitsReconstruction new second conjunct !effectiveSplitsInput || effectiveSplitsInput.length === 0 (this PR) use the identical "!x or x.length === 0" shape. Confirmed mirrored correctly, not just structurally similar - both treat omitted and explicit-empty identically, and both guard against the same under-cautious undefined-only check this item name describes.

## PERCENTAGE "adjacent gap" fix - confirmed real and unconditional

Before: the membership-validation loop lived inside if (participantIds && participantIds.length > 0) { ...filter...; ...validate... } - so a request with an explicit splits array and NO participantIds validated nothing.

After: await assertActiveMembers(groupId, filteredSplits.map((s) => s.userId)); is now a standalone statement after the if block, unconditional on whether participantIds was supplied.

## createExpense COLLECTIVE sum-guard - confirmed finished and tested

assertSplitsSumToTotal(splits, total) is now called in createExpense inline COLLECTIVE block, right after calculateCollectiveSplits and before deleteMany/createMany, finishing the item PR 2 left partial. Both splits and total are correctly in scope at that call site (verified by reading the surrounding closure, not assuming from the diff hunk alone).

Reachability claim ("unreachable under normal input, but testable via mocking") confirmed accurate: calculateCollectiveSplits is mocked via vi.mock('../../utils/splits.js', ...) to return a deliberately mismatched sum (100 vs total 150), and the test (createExpense - COLLECTIVE split-sum guard) asserts the rejection AND that expenseSplit.createMany is never called.

## tasks.md Phase 3 addendum - accuracy check

The addendum lists 3 findings, all explicitly triaged as deferred/accepted, none silently dropped:

1. PERCENTAGE assertActiveMembers call ignores participantIdsAreCallerProvided (always re-validates even on reconstructed splits) - deferred with a stated reason (flag tracks participantIds reconstruction, not splits reconstruction; they can diverge independently; blind reuse risks a wrong skip or wrong rejection). Reasoning is sound and specific, not hand-waved.
2. createExpense COLLECTIVE path still hand-rolls membership validation instead of using the new assertActiveMembers - deferred because consolidating would silently drop COLLECTIVE incidental duplicate-userId detection that assertActiveMembers does not perform. Verified: this is a real, distinct behavioral difference, not an excuse.
3. computeSplits trusting the participantIdsAreCallerProvided: false flag via doc comment only, and the flag being a separately-tracked let that could drift from effectiveParticipantIds reassignment - accepted as speculative hardening against no current caller. Confirmed no current caller exercises either risk path.

None of the three is a correctness bug in the current code; all three are scope-expansion or hardening-for-hypothetical-future items that ponytail correctly excludes from this PR. The addendum is accurate, not a cover for something that should have been fixed now.

## SUGGESTION-level notes (non-blocking)

1. Finding 1 in the addendum (PERCENTAGE ignoring the reconstruction flag) causes one real, if cheap, inefficiency: a wasted groupMember.findMany round-trip on every PUT { amount }-style PERCENTAGE reconstruction. Confirmed low-risk (correctness unaffected, cost is one extra read query) - fine to leave for the dedicated follow-up as planned.
2. The "explicit non-member rejected on update" scenario (item 4) has no dedicated updateExpense-side test; coverage rests entirely on the shared-code-path argument. The argument is correct (verified above), but a future refactor that gives updateExpense its own default value for the options param (instead of relying on computeSplits top-level default) would silently break this guarantee with no test to catch it. Worth a one-line comment at the computeSplits call site in updateExpense noting the default is load-bearing for this scenario - optional, not required for this PR.

## Conclusion

Every item-4/item-5 spec scenario is traced to either a specific test or an explicit, sound, documented reason for sharing one test across two call sites. The three real findings in the post-apply addendum are correctly triaged, not swept under the rug. Test counts match exactly (88/50). Scope is contained to the 4 expected files. No AI attribution in either commit. PR 3 is ready to push and open for human review.
