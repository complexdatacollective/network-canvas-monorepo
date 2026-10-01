---
'@codaco/protocol-utilities': patch
---

`SyntheticInterview` now requires `@faker-js/faker` 10.6, so a given seed draws
different personal names than before.

Faker 10.6 reorganised its English first names by gender, which changes the
names its seeded stream produces. Fixtures or snapshots that pinned generated
names need updating: seed 42's first node, for example, is now "Nikita Crist"
rather than "Mohammad Crist".
