---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
---

Add a shared protocol-card visual shell and animated emphasis border for Interviewer, Architect, and website previews. `Collection` can also preserve native link and button semantics and run fuzzy filtering synchronously when a rendering environment does not support the default search worker.

`Collection` now seeds its store with the initial items, so server-rendered and statically exported markup contains the items rather than the empty state. In native-item mode the item props only carry the keys the collection owns, so a consumer's own click handler survives either spread order, and keyboard drag handling is still forwarded.

`Collection` accepts `scrollable={false}` for a collection laid out in the flow of a page that already scrolls: the items render in a plain container instead of a ScrollArea, so nothing is clipped at the collection's edges and no nested scroll region or tab stop is created. Virtualisation and the ScrollArea options are unavailable in that mode.

The seeded store also starts in the collection's initial sort order, so server output and the first client render are sorted rather than in load order, and the virtualised renderer now finds its scroll viewport on mount even when nothing updates the store afterwards.
