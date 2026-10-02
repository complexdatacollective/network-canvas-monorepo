---
'@codaco/architect': patch
---

The hint under a node or edge type's name field now suggests only names the field accepts. The English edge example "Works With" contained a space, so a researcher who typed it in was told it was not a valid name; it is now "Colleagues". The Spanish, British English and Simplified Chinese hints had the same problem (spaces, accented letters and Chinese characters) and now use valid examples too, with the Chinese meaning given in parentheses beside each English name. A test checks every language's examples against the field's own rule, so a future translation cannot reintroduce the problem.
