---
'@codaco/architect': patch
---

A long protocol name can no longer swallow the editor screen, and protocol names now have a stated limit.

**The name on the protocol card is bounded.** It used to grow a line for every line the name needed, with nothing stopping it: a 342-character name stood 703px tall inside a 720px-tall window, and pushed the stage timeline's first row nearly a screen and a half down the page. The name now paints at most three lines and scrolls beyond that, and its heading steps down a size as the name gets longer so a name at the new limit still reads in full at every window width — on the same 342-character name the card is 419px instead of 1001px, and the timeline is back on screen.

**Protocol names are now limited to 100 characters**, stated on the create dialog before you type and counted down beside the name as you approach it. Creating a protocol with a longer name is refused with an explanation rather than silently shortened, and the editor's own name field stops accepting characters past the limit and shows you why on screen — pasting an over-long study title never looks like nothing happened. The limit counts characters the way you see them, so an emoji or a letter with an accent costs one, not four or eight.

**Protocols you already have are untouched.** A name longer than the limit — imported, or written before the limit existed — still opens, still reads in full to a screen reader, and is never rewritten or trimmed on your behalf. It simply renders within the same bound, and you can shorten it whenever you like: only edits that make an over-long name longer are refused.

**Right-to-left names now read from the correct end.** An Arabic or Hebrew protocol name in the breadcrumb, the start-screen library, the protocol card and the printed summary cover takes its direction from the name itself, so the part that gets trimmed is the end of the name rather than a slice out of its middle. Hovering any of them shows the whole name.

Also bounded: the protocol summary cover, which is the entire view a second tab gets when it cannot claim the protocol, and where an over-long name previously filled three-quarters of the screen.
