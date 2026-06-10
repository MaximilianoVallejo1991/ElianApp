# Proposal: Archive & Hide System for Groups

## Intent

Enable every group member to archive a group after all payments are settled and debts cleared. Archived groups move to a separate tab so they don't clutter the active view. Individual members can then hide/delete the group from their own interface. When the last participant hides/deletes the group, it is hard-deleted from the database. Archived groups remain accessible but non-intrusive.

## Scope

### In Scope
- Member-level archive (`archivedAt`) and hide (`hiddenAt`) on `GroupMember`
- Archive action available when balances are zero
- Archived tab in `GroupsPage`; hide/archive controls in `GroupDetailPage`
- Hard-delete group when last participant hides it
- Historical visibility: archived groups remain accessible but non-intrusive

### Out of Scope
- Closure periods for STATIC groups (moved to `static-group-closures`)
- Freezing expenses during closure
- Payment registration per member during closure
- Creditor acceptance flow
- Partial vs final closure
- Period model and balance scoping by period
- Auto-acceptance or auto-close logic
- Notifications or push events for archive state changes

## Capabilities

### New Capabilities
- `group-archive`: Member-level archive and hide; group hard-delete when all members hide

### Modified Capabilities
- `group-management`: Group list queries filtered by `archivedAt`/`hiddenAt`

## Approach

1. **Data model**: Add `GroupMember.archivedAt`/`hiddenAt`. No Prisma schema changes beyond these fields.
2. **Backend**: New `archive.service.js` (archive, hide, unarchive). Update `group.service.js` to filter by `archivedAt`/`hiddenAt`. Endpoint to check if balances are zero before allowing archive.
3. **Frontend**: Archive/hide buttons in `GroupDetailPage`, `GroupsPage` tab switcher (Active / Archived).
4. **Migration**: Default existing `GroupMember` rows to `archivedAt=null` and `hiddenAt=null`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | Add `GroupMember.archivedAt`/`hiddenAt` |
| `src/services/archive.service.js` | New | Archive/hide logic and hard-delete gate |
| `src/services/group.service.js` | Modified | Filter by `archivedAt`/`hiddenAt` in group lists |
| `src/controllers/` | New/Modified | Archive, hide, unarchive endpoints |
| `src/pages/GroupDetailPage.jsx` | Modified | Archive/hide buttons |
| `src/pages/GroupsPage.jsx` | Modified | Active / Archived tabs |
| `openspec/specs/` | New | Delta spec for `group-management` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Frontend state confusion between archive and hide | Med | Clear naming: archive → move to archived tab; hide → remove from archived tab (triggers delete if last) |
| Accidental hard-delete of group | Low | Show confirmation dialog before hide; hard-delete only when all members hide |

## Rollback Plan

1. Revert Prisma migration (restore previous schema).  
2. Delete new service/controller files.  
3. `GroupMember.archivedAt`/`hiddenAt` are ignored by old code, so existing groups remain functional during rollback.

## Dependencies

- Prisma migration support (already configured)

## Success Criteria

- [ ] DYNAMIC and STATIC groups can archive when balances are zero, then hide; group hard-deletes when last member hides
- [ ] Archived groups appear in a separate tab on `GroupsPage`
- [ ] `pnpm -r run build` passes
