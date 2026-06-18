---
'@codaco/protocol-validation': patch
'@codaco/protocol-utilities': patch
'@codaco/interview': patch
'@codaco/fresco-ui': patch
---

Fix two NameGeneratorRoster bugs and remove a dead schema field.

- **Roster cards no longer show a raw UID.** When the name heuristic could not
  resolve a label for an external-roster node (e.g. the asset came from a
  preview interview export whose attribute keys are variable UUIDs absent from
  the running codebook, or the subject has no populated text variable), the
  card title fell back to the node's content-hash `_uid` — an opaque "random
  ID". The new `resolveRosterNodeLabel` falls back to the first usable
  attribute value, then to a stable `Unnamed {subject} {n}` placeholder.
- **DataCards shrink to fit narrow panels.** `GridLayout`'s
  `repeat(auto-fill, minmax(Npx, 1fr))` forced columns to at least `minItemWidth`
  even in a narrower container, so a single roster card overflowed its panel at
  the default resizable width (observed on iPad), breaking drag-and-drop. The
  column floor is now `min(Npx, 100%)` so a lone column shrinks to fit.
- **The roster panel can't be resized narrower than a card.** `ResizableFlexPanel`
  gains an optional `minSizePx` (a hard pixel floor for the first panel, enforced
  by the resize hook and a CSS backstop). NameGeneratorRoster sets it to the card
  width plus chrome, so the resize handle stops before a card would overflow.
- **Removed the unused `cardOptions.displayLabel`.** It was introduced in the v8
  schema but was never read by any application (legacy or current) and cannot be
  set in Architect. Dropped from the schema, the `protocol-utilities` types, and
  the `SyntheticInterview` builder.
