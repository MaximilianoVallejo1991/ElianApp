# Unified Expense Wizard Specification

## Purpose

Single adaptive expense creation modal that reconfigures its steps and fields based on the selected split type. Replaces multiple forms with one unified wizard.

## Requirements

### Requirement: Base step fields (all split types)

The system MUST display identical base fields for all split types in Step 1: description, amount, date, category, payer selector, and split type selector.

#### Scenario: EQUAL split shows base fields

- GIVEN user has opened the expense wizard with split type set to EQUAL
- WHEN wizard renders Step 1
- THEN user sees: description input, amount input, date picker, category dropdown, payer dropdown, and split type selector

#### Scenario: PERCENTAGE split shows base fields

- GIVEN user has opened the expense wizard with split type set to PERCENTAGE
- WHEN wizard renders Step 1
- THEN user sees: description input, amount input, date picker, category dropdown, payer dropdown, and split type selector

#### Scenario: COLLECTIVE split shows base fields

- GIVEN user has opened the expense wizard with split type set to COLLECTIVE
- WHEN wizard renders Step 1
- THEN user sees: description input, amount input, date picker, category dropdown, payer dropdown, and split type selector

### Requirement: EQUAL split type — automatic share computation

The system SHALL compute equal shares automatically based on the active group member count. The creator MUST NOT enter per-person amounts.

#### Scenario: EQUAL expense created with 4 members

- GIVEN user is creating an expense with amount 100.00 and split type EQUAL in a group with members A, B, C, D
- WHEN user fills base fields and clicks Create
- THEN system computes shares as 25.00 each for A, B, C, D
- AND expense status = COMPLETED
- AND isLocked = true

### Requirement: PERCENTAGE split type — 100% validation

The system SHALL validate that entered percentages sum to exactly 100% before enabling the Create button.

#### Scenario: Valid percentages sum to 100%

- GIVEN user is creating an expense with split type PERCENTAGE
- WHEN user enters percentages: A=50%, B=30%, C=20%
- THEN Create button is enabled

#### Scenario: Invalid percentages do not sum to 100%

- GIVEN user is creating an expense with split type PERCENTAGE
- WHEN user enters percentages: A=50%, B=30%, C=10% (sums to 90%)
- THEN Create button is disabled
- AND system displays validation error "Percentages must sum to 100%"

### Requirement: COLLECTIVE split type — no creator amount entry (CRITICAL)

The system MUST NOT display any per-participant amount input fields in the COLLECTIVE wizard. The creator only enters shared costs and selects participants. Each participant reports their own item amount via GroupDetailPage.

#### Scenario: COLLECTIVE wizard has no per-participant amount fields

- GIVEN user is creating an expense with split type COLLECTIVE
- WHEN wizard renders Step 2 (Configure)
- THEN user sees shared costs input and participant checkboxes
- AND user does NOT see any per-participant amount input fields

#### Scenario: Creator cannot manually assign participant amounts

- GIVEN user is on COLLECTIVE wizard Step 2
- WHEN user inspects the form fields
- THEN there is no field labeled "participant amount" or similar
- AND no field where creator can enter amounts for individual participants

### Requirement: COLLECTIVE split type — two-step flow

The system SHALL show exactly two steps: (1) Configure — shared costs + participant selection, (2) Confirmation with summary.

#### Scenario: COLLECTIVE flow has two steps

- GIVEN user selected COLLECTIVE split type
- WHEN user completes Step 1 base fields
- THEN wizard shows Step 2 with shared costs and participant checkboxes
- AND after completing Step 2, user sees confirmation summary
- AND only then is Create button enabled

### Requirement: COLLECTIVE split type — pending state on creation

The system SHALL set status = PENDING and isLocked = false when a COLLECTIVE expense is created with no participant items.

#### Scenario: COLLECTIVE created with shared costs only

- GIVEN user creates a COLLECTIVE expense with sharedCosts = 50.00 and no items
- WHEN expense is saved
- THEN expense status = PENDING
- AND isLocked = false
- AND expense appears in GroupDetailPage for participants to report items

### Requirement: EXACT split type removal

The system MUST reject expense creation requests with splitType = 'EXACT' with HTTP 400 and error code INVALID_SPLIT_TYPE.

#### Scenario: EXACT split type rejected

- GIVEN client sends createExpense request with splitType = 'EXACT'
- WHEN backend processes the request
- THEN system returns HTTP 400 with `{ error: "EXACT split type no longer supported", code: "INVALID_SPLIT_TYPE" }`

#### Scenario: EXACT enum value does not exist in schema

- GIVEN developer queries ExpenseSplitType enum values
- WHEN enum values are enumerated
- THEN EXACT is not among EQUAL, PERCENTAGE, COLLECTIVE