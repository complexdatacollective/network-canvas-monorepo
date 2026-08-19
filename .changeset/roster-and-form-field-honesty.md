---
'@codaco/interview': patch
---

An interview no longer says things about a question, or about a list, before it
knows them.

**A roster stops reporting itself empty before it has been read.** A Name
Generator built on a roster, and an external panel in an ordinary Name
Generator, both showed their empty message on the first frame — "There is
nothing to add from this list" — because "not started" and "finished, and there
was nothing" looked identical from the outside. That is a statement about the
researcher's data, and it was made before any of it had been looked at. Both
now wait, showing that they are loading until the list has actually arrived,
and an unreadable roster reports the failure instead of an empty list.

**A question is called one thing.** The caption a participant reads and the
name a validation message uses when it refers to that same question were worked
out separately, from different rules. They now come from one rule, so a
message can only name a question by text that is on the screen. As part of
that, a caption with stray spaces around it is tidied, and a question whose
caption was left blank falls back to the variable's name rather than rendering
with nothing at all — an unnamed box on screen.

**A required yes/no question is corrected in one place.** A required yes/no
question is shown as an unselected Yes/No pair rather than an on/off switch,
because a switch has no "unanswered" state to show. That correction, and the
authored answer options it necessarily replaces, had been written twice — once
for interview forms and once for the standalone field that authoring tools
mount — so the two could have come to different conclusions about the same
question. There is now one.
