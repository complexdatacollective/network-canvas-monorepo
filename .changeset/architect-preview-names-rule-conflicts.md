---
'@codaco/architect': patch
---

Previewing a protocol whose validation rules cannot all be satisfied now
explains why. The preview lists each clash — naming the entity type and the
variables involved, and describing the conflict — so you can go back, correct
the rules, and preview again. Previously this showed the same generic
"couldn't build the preview" screen as any other failure, with a "Try again"
button that could only fail in exactly the same way.

A preview that fails to rebuild also clears what was on screen, so an earlier
successful preview is never left showing as though it were the protocol you
just changed.
