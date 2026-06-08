import * as individualItemService from '../services/individual-item.service.js';

// ---------------------------------------------------------------------------
//  Individual Item Controller
// ---------------------------------------------------------------------------
//  Request / response layer. Delegates to individualItemService for domain
//  logic. Express 5 forwards rejections automatically to error middleware.
//
//  All handlers assume:
//    - req.user is set by the authenticate middleware
//    - req.params.id is the collective expense ID (from mergeParams)
//    - req.params.itemId is the individual item ID
// ---------------------------------------------------------------------------

/**
 * POST /groups/:groupId/collective-expenses/:id/items  (PROTECTED)
 *
 * Add your own individual item to a collective expense.
 * Body validated by Zod middleware before this handler runs.
 */
export async function add(req, res) {
  const item = await individualItemService.add(
    req.params.id,       // collectiveExpenseId
    req.user.userId,
    req.body,
  );
  res.status(201).json(item);
}

/**
 * PUT /groups/:groupId/collective-expenses/:id/items/:itemId  (PROTECTED)
 *
 * Update your own individual item. You must own the item.
 */
export async function update(req, res) {
  const item = await individualItemService.update(
    req.params.itemId,
    req.user.userId,
    req.body,
  );
  res.status(200).json(item);
}

/**
 * DELETE /groups/:groupId/collective-expenses/:id/items/:itemId  (PROTECTED)
 *
 * Delete your own individual item. You must own the item.
 */
export async function remove(req, res) {
  await individualItemService.remove(req.params.itemId, req.user.userId);
  res.status(204).end();
}
