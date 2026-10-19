---
'@codaco/architect': major
---

Architect 8 now comes with Architect 9, so you can keep working on a schema 8
protocol without upgrading it. Architect 8 opens in the same browser tab, at
`/v8/` on the Architect site, and works offline too: Architect 9 downloads it
in the background, after it has finished loading itself.

- When you open a protocol made for schema 8 or earlier — from a file, by
  dragging it in, from your computer's file manager, or from the library —
  Architect asks how to open it. **Upgrade to schema 9** creates an upgraded
  copy and opens it; the original is never changed. **Keep editing as schema
  8** opens the protocol, unchanged, in Architect 8.
- The protocols you saved in Architect 8 appear in the library beside your
  schema 9 protocols, marked with their schema version, and marked "Has an
  upgraded copy" once you have upgraded one. Their menu can upgrade the
  protocol, open it in Architect 8, download it as a `.netcanvas` file or show
  its details. Architect remembers when you chose to keep a protocol in
  Architect 8 and opens it there next time.
- From inside Architect 8, "Upgrade to schema 9" brings the protocol back to
  Architect 9 as an upgraded copy.
- Architect 9 keeps its own library, separate from Architect 8's. It never
  changes or deletes a protocol saved in Architect 8, and **Clear all**
  removes only what is saved in Architect 9.
