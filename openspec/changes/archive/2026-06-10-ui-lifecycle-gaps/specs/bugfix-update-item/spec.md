# Update Item HTTP Method Bugfix Specification

## Purpose

Fix the `expenseService.updateItem` method in the frontend API service layer that incorrectly uses `api.put()` instead of `api.patch()`, causing COLLECTIVE expense item updates to fail because the backend route is `PATCH /groups/:groupId/expenses/:id/items/:itemId`.

## Requirements

### Requirement: Update Item Uses PATCH Method

The frontend `expenseService.updateItem` method MUST use `api.patch()` to match the backend route `PATCH /groups/:groupId/expenses/:id/items/:itemId`. The system MUST return HTTP 200 with the updated item on success.

#### Scenario: Update item succeeds with PATCH method

- GIVEN user 2 has item 5 on COLLECTIVE expense 1 in group 1
- WHEN frontend calls `expenseService.updateItem(1, 1, 5, { amount: 45 })`
- THEN the service sends `PATCH /groups/1/expenses/1/items/5` with `{ amount: 45 }`
- AND backend returns HTTP 200 with updated item