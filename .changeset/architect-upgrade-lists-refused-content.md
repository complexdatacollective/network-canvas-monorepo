---
'@codaco/architect': patch
---

When a schema 8 protocol cannot be upgraded because something in it is empty
that schema 9 requires, such as a prompt, an option value or an attribute
name, Architect now says so and lists each problem with the stage and prompt,
or the type, attribute and option, where it is. Correct them in the version of
Architect the protocol was made with, then open it again. Nothing is saved.
