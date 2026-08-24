---
'@codaco/architect': patch
'@codaco/interview': patch
---

This release improves the reliability, accessibility, and recovery of protocol editing in Architect.

- Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
- Forms, rule builders, the Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
- A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
- Protocol names, resource cards, variable identifiers, and stage editors are bounded on narrow screens. Duplicate resource filenames are distinguishable without changing the names stored in the protocol.
- Invalid imports, blocked edits, migration conflicts, preview completion, and deleted protocol routes now explain what happened and provide a safe recovery path.
- Existing protocols with invalid references or conflicting interface-owned variables are explained before opening. Automatic repairs are described and are not applied without confirmation.
- Recent protocols in the library now show their description, and starter templates show their stage, node type, and edge type counts.
- The CEGRM starter template now uses an available color for its Narrative Pedigree condition. Narrative Pedigree resolves node palette selections through the active theme in its key, pedigree, dimming, and snapshots, while neutral dialog actions remain distinct from white dialog surfaces.
