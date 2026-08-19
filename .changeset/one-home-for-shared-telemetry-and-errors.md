---
'@codaco/shared-consts': minor
'@codaco/protocol-validation': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Architect always reports usage again, and every product now describes an error the same way.

**Architect's analytics could be switched off by accident.** Architect alone
read its analytics project key from a build-time setting and, when that setting
was missing, started up with analytics silently off — a successful build that
simply stopped reporting, with nothing to notice. The key is public information
shared by every Network Canvas product, so Architect now uses the same built-in
value as Interviewer, Fresco, the documentation site and the project website.
There is no longer a way for a release build to lose its telemetry by omission.
Analytics is still off in local development, and can still be turned off
explicitly for test and preview builds.

**One description of an error, everywhere.** Every product carried its own copy
of the code that turns an unexpected failure into a readable error, and only
Architect's copy had been fixed to stop pasting a whole stack trace into the
message shown to the user. All the copies have been replaced by one shared
implementation with that fix, so an error raised while validating a protocol,
loading a roster, syncing an interview or importing a protocol now reads as a
plain sentence in every product rather than a wall of technical detail in some.
