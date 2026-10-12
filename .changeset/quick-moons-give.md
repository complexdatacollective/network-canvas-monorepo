---
'@codaco/architect': patch
'@codaco/interviewer': patch
---

The hourly check for a new app version no longer reports a crash when it
cannot reach the network.

Both apps ask the browser to re-fetch `sw.js` once an hour to see whether a new
version has been deployed. That fetch fails routinely — the device is offline,
behind a captive portal, or a deploy is swapping assets mid-request — and the
failure was left unhandled, so it surfaced as an uncaught `TypeError` and was
reported to error tracking as an app crash. A failed background check is now
silent; the next hourly check simply tries again, and the update banner is
unaffected.
