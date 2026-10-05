---
'@codaco/protocol-validation': patch
---

A name generator prompt's additional attributes must now be boolean variables.
Previously a hand-edited protocol could point one at a text, number or
categorical variable — including an encrypted one — and adding a node to the
prompt would overwrite that answer with true or false. Migrating a protocol to
schema 8 removes any additional attribute that targets a non-boolean variable
and adds a migration note saying so.
