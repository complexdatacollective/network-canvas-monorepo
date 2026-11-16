---
'fresco': patch
---

The setup and protocols pages load less JavaScript up front. The code that reads and validates a protocol file now downloads when you choose a file to import, instead of with the page, which removes about 300 KB of compressed JavaScript from the setup page and 200 KB from the protocols page.
