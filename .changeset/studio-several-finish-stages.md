---
'@codaco/studio-api': minor
---

A protocol can now end with more than one finish stage, so different routes
through the interview can end differently, for example a "completed" ending
and an "ineligible" one. Adding another finish stage is no longer refused: it
goes at the end of the timeline when no position is given, and a position
above the first finish stage puts it at that stage's place instead, so no
other screen is ever left after a finish stage. Finish stages can be reordered
among themselves, but not above the first one. Any finish stage can be removed
except the last one left.
