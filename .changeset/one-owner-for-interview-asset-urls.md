---
'@codaco/interview': minor
---

The owner that hands out interview asset URLs is now part of the public contract.

For anyone embedding the interview engine, `createAssetUrlOwner` is available
from `@codaco/interview/contract`. It gives a host one live URL per asset
however many parts of a screen ask for it at once, replaces that URL when a
newer copy of the asset arrives, and takes every URL back when the host is
finished with it, so interview data stays decrypted in memory for no longer than
it is on screen.
