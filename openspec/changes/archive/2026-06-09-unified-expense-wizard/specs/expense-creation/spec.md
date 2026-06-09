# Delta for expense-creation

## MODIFIED Requirements

### Requirement: Single modal for all split types

The system MUST provide one expense creation modal that adapts its fields and steps based on the selected split type. The wizard MUST NOT use different modal components per split type.

(Previously: Separate forms for EQUAL/PERCENTAGE and a distinct 4-step wizard for COLLECTIVE)

#### Scenario: Wizard adapts to EQUAL

- GIVEN user opens the expense creation modal
- WHEN user selects split type EQUAL
- THEN wizard shows single-step form with computed shares
- AND Create button appears after confirming shares

#### Scenario: Wizard adapts to PERCENTAGE

- GIVEN user opens the expense creation modal
- WHEN user selects split type PERCENTAGE
- THEN wizard shows single-step form with percentage inputs
- AND Create button appears after percentages sum to 100%

#### Scenario: Wizard adapts to COLLECTIVE

- GIVEN user opens the expense creation modal
- WHEN user selects split type COLLECTIVE
- THEN wizard shows two-step flow: Configure then Confirm
- AND no per-participant amount entry is shown

### Requirement: COLLECTIVE wizard — creator does not enter participant amounts

The system MUST NOT display per-participant amount inputs in the COLLECTIVE wizard. The creator enters only sharedCosts and selects which participants are involved. Each participant reports their own item via GroupDetailPage.

(Previously: 4-step wizard with Step 1 redundancy; creator could enter amounts in earlier versions)

#### Scenario: Creator enters only shared costs

- GIVEN user is on COLLECTIVE wizard Step 2 (Configure)
- WHEN user enters sharedCosts = 25.00
- AND user selects participants A, B, C
- THEN no amount input fields for A, B, or C are displayed
- AND sharedCosts is saved with the expense

### Requirement: EXACT split type no longer available

The system MUST reject attempts to create expenses with splitType EXACT. The system MUST NOT show EXACT as an option in any split type selector.

(Previously: EXACT was a valid split type with dedicated form fields)

#### Scenario: EXACT not selectable in wizard

- GIVEN user is on the split type selector in the expense wizard
- WHEN user views the available options
- THEN EQUAL, PERCENTAGE, and COLLECTIVE are shown
- AND EXACT is NOT shown

#### Scenario: Backend rejects EXACT expense creation

- GIVEN client sends createExpense with splitType = 'EXACT'
- WHEN backend validates the request
- THEN system returns HTTP 400 with error code INVALID_SPLIT_TYPE

## ADDED Requirements

### Requirement: Wizard step count based on split type

The system SHALL show 1 step for EQUAL and PERCENTAGE split types. The system SHALL show 2 steps for COLLECTIVE split type.

#### Scenario: EQUAL completes in one step

- GIVEN user selected split type EQUAL
- WHEN user fills base fields
- THEN wizard shows computed shares
- AND Create button is visible without additional steps

#### Scenario: COLLECTIVE requires two steps

- GIVEN user selected split type COLLECTIVE
- WHEN user completes Step 1 (base fields)
- THEN Step 2 appears with Configure options
- AND after completing Step 2, confirmation appears
- AND Create button is then enabled