---
'networkcanvas.com': patch
---

Pages no longer re-render part of themselves on load. The footer's copyright
year is now fixed when the site is published, instead of being read from the
visitor's device, which could disagree with the published page and force the
browser to rebuild it.
