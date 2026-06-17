---
'@codaco/interview': patch
---

Fix `ActionButton` icons rendering off-centre (e.g. the rotate/refresh icons): Lucide SVGs carry intrinsic `width`/`height` attributes, so the old `w-auto` sizing left the browser to back-derive the width inconsistently and could produce a non-square icon box. Lucide icons are now given an explicit square size so any icon centres reliably. Improve the visibility of the "missing" bin on the Ordinal Bin interface, which previously blended into the background; it now uses visible neutral surface tokens.
