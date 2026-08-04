---
'@codaco/network-exporters': patch
---

The export pipeline now tears down the ZIP output sink when it is interrupted
(releasing any buffered archive data), and yields to the host's event loop
between stages and every 25 generated or written files so browser hosts can
render the progress events they are sent.
