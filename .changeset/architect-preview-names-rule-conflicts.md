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
just changed. Each attempt reports only its own reason for failing: a list of
rule clashes from an earlier attempt is never left up next to a failure that
had nothing to do with those rules, and a slow protocol that arrives after the
preview has given up waiting now reports what actually happened to it — the
rule clashes to correct, or the preview itself — instead of continuing to
blame the connection to Architect.
