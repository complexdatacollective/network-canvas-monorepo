---
'@codaco/architect': patch
---

Stop offering an image background for Network Composer stages (the stage schema rejects one and the interface never rendered it), and clear a stale background image from stages authored before the option was withdrawn so they validate again.
