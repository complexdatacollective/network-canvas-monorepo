# @codaco/studio-client

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Add a team workspace with a persistent active-team switcher, team-scoped protocols, member and invitation views, collaborator invitations, and owner/admin role management.

### Patch Changes

- Saving a screen now merges into the draft as it stands at that moment, rather
  than into the copy the form was opened with. A change that arrived while the
  screen was open — a save from another editor, or an acknowledgement of your
  own earlier one — is no longer overwritten by the save that follows it.
