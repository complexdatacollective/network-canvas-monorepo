---
'@codaco/studio-api': patch
'@codaco/studio-web': patch
---

Changes you make to the codebook while editing a stage are now part of that
stage's edit. This includes an attribute's validation rules, new attributes and
types, answer options, input controls, renamed attributes, encrypted attributes
and family pedigree symbols, and wording shared by every stage of a kind. The
stage editor shows these changes as unsaved
work, and they are saved together with the stage. Cancelling the stage undoes
them. Previously these changes were saved immediately and stayed even after the
stage was cancelled.
