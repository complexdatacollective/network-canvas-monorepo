---
'@codaco/architect': patch
---

A protocol that cannot be brought up to date now says why.

Two attributes on one entity may not share a name. Older versions of Architect
allowed it. Bringing such a protocol up to date fails, and the only thing shown
was "Protocol migration failed.", which gave the researcher an instrument that
would not open and nothing to act on.

The message now names the attribute and the entity it is on, and says what to
do: open the protocol in the version of Architect that created it, rename one of
them, and open it here again. Nothing is renamed automatically — the two are
genuinely separate attributes with separately collected data and separate export
columns, so which one keeps the name is the researcher's decision.

Any other failure to bring a protocol up to date now reports what the check
objected to, instead of the same generic sentence.
