---
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
'@codaco/studio-web': minor
---

A new protocol now starts with a Finish Screen stage, the screen every schema 9
interview ends at, carrying Network Canvas's supplied text in English. A
protocol created in Studio is therefore valid from the start, where before it
had no stages at all and could not be published until one was added by hand.

The timeline keeps finish stages last, as Architect does. A protocol can end
with several, so different routes through the interview can end differently,
for example a "completed" ending and an "ineligible" one. A screen added
without a position, or at a position past the first finish stage, goes in
front of it. A finish stage added without a position goes at the end, and one
placed above the first finish stage takes that stage's place, so no other
screen is ever left after a finish stage. Finish stages can be reordered among
themselves, but not above the first one, and a reorder that would put a
screen after a finish stage or leave the interview ending somewhere else is
refused. In the editor's outline, the move buttons that would do that are not
offered. Any finish stage can be removed except the last one left. Saving a
screen as a different kind is refused when it would turn a finish stage into
another kind of screen, or another screen into a finish stage.

Publishing refuses a protocol whose finish stage is missing text it shows in
its default language, naming what is missing. A protocol in a language Network
Canvas has no closing text for starts that way.

Development seed data now leaves a completed interview at the finish stage it
ended at, as Interviewer and Fresco record it, rather than past the last stage.

A finished interview now records where it ended: the finish stage the
participant confirmed Finish on, and the outcome that stage declares
(completed, ineligible or terminated). Before, Studio recorded every finish as
completed and kept neither. The participant finish call carries both, and the
server records them only when they name one of the protocol's finish stages and
the outcome it declares; any other finish is refused and nothing is saved. The
session and its frozen snapshot, which exports read, carry both values. A
finish sent again after the interview has finished, with any outcome, is
answered as already finished and changes nothing.

The upgrade adds the migration `0005_session_finish`. An interview completed
before it keeps no finish stage or outcome, since none was recorded; every
interview completed after it must record both.

Finishing an interview now leaves the participant on the interview's own
finished screen, the text its finish stage shows once the interview is
finished. Before, Studio replaced the interview with its generic
"You've finished this interview" page the moment the finish was recorded, so
the protocol's closing text was never shown. The generic page is still shown
when a participant opens an interview that was already finished.
