---
'@codaco/architect': patch
---

A protocol that cannot be brought up to date now says why.

Attribute names are compared without regard to capitalisation or accents, so
two attributes on one entity called "name" and "NAME" — or the same word typed
with the accent composed differently — count as the same name. Older versions of
Architect allowed that pair. Bringing such a protocol up to date fails, and the
only thing shown was "Protocol migration failed.", which gave the researcher an
instrument that would not open and nothing to act on.

The message now names both spellings and the entity they are on, and says what
to do: open the protocol in the version of Architect that created it, rename one
of them, and open it here again. Nothing is renamed automatically — the two are
genuinely separate attributes with separately collected data and separate export
columns, so which one keeps the name is the researcher's decision.

Any other failure to bring a protocol up to date now reports what the check
objected to, instead of the same generic sentence.
