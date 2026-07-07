---
'@codaco/architect': patch
---

Close a batch of data-durability, privacy and safety gaps surfaced by the pre-release audit follow-up:

- **Encrypted variables:** editing a field in the Network Composer or Family Pedigree editors no longer strips the variable's `encrypted` flag.
- **Analytics privacy:** import-validation failure analytics no longer embed protocol-derived strings (codebook keys, variable names, entered values) — only structural error codes/paths are sent.
- **Asset export:** distinct assets whose names sanitise to the same archive entry no longer silently overwrite each other, and the primary Download button now warns when a `.netcanvas` is exported with unresolved assets.
- **Validation timing:** an edit that lands while a validation is in flight is no longer dropped, and auto-undo no longer reverts a valid newer edit or stacks dialogs.
- **Undo/persistence:** inline-created variables with an invalid name show a friendly error instead of throwing; a mismatched rehydrated protocol id/content pair can't autosave the wrong content into a library row; a `sessionStorage` quota failure now surfaces the storage-unavailable banner instead of silently going in-memory.
- **Preview:** assets held in the Safari-private in-memory fallback are now transferred to the preview tab, so media/roster protocols preview correctly.
- **PWA updates:** the update auto-apply now also defers during the autosave-debounce window after a stage edit and during bundled-template imports, so a fresh-load auto-update can't reload mid-write.
- **Storage GC:** orphaned asset blobs are now removed within a transaction that includes the assets table, so the delete no longer throws and leaves the blob behind.
- **Stage editor:** a multi-step browser Back from a dirty stage editor now prompts before discarding the draft, and the unsaved-variable dialog confirms before a backdrop dismiss.
