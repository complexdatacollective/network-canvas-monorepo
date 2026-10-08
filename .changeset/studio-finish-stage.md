---
'@codaco/studio-api': minor
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
