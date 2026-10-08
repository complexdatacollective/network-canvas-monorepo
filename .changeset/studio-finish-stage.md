---
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
'@codaco/studio-web': minor
---

A new protocol now starts with a Finish Screen stage, the screen every schema 9
interview ends at, carrying Network Canvas's supplied text in English. A
protocol created in Studio is therefore valid from the start, where before it
had no stages at all and could not be published until one was added by hand.

The timeline keeps the finish stage last, as Architect does. A screen added
without a position, or at a position past the finish stage, goes in front of
it. A protocol has exactly one finish stage, so adding a second is refused.
Removing a protocol's only finish stage is refused, and so is a reorder
that would put a screen after the finish stage or leave the interview ending
somewhere else. In the editor's outline, the move buttons that would do that
are not offered. Saving a screen as a different kind is refused when it would
turn the finish stage into another kind of screen, or another screen into a
second finish stage.

Publishing refuses a protocol whose finish stage has no heading or text in its
default language, naming what is missing. A protocol in a language Network
Canvas has no closing text for starts that way.

Development seed data now leaves a completed interview at the finish stage it
ended at, as Interviewer and Fresco record it, rather than past the last stage.

A finished interview now records where it ended: the finish stage the
participant confirmed Finish on, and the outcome that stage declares
(completed, ineligible or terminated). Before, Studio recorded every finish as
completed and kept neither. The participant finish call carries both, and the
server records them only when they name the protocol's own finish stage and
the outcome it declares; any other finish is refused and nothing is saved. The
session and its frozen snapshot, which exports read, carry both values. A
finish sent again after the interview has finished, with any outcome, is
answered as already finished and changes nothing.

The upgrade adds the migration `0005_session_finish`. An interview completed
before it keeps no finish stage or outcome, since none was recorded; every
interview completed after it must record both.
