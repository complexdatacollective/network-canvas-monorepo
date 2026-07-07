---
'@codaco/architect': patch
---

Fixed a memory leak in the protocol summary where an asset preview's object URL was never released if the asset finished loading after the preview had already closed or switched to a different asset.
