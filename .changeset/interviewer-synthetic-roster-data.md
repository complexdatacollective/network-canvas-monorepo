---
'@codaco/interviewer': minor
---

Synthetic sessions now pick people from a protocol's actual rosters. Previously,
a roster screen generated invented people, so test data never lined up with the
roster file and that mismatch carried into every later stage. Generated sessions
now draw from the real roster rows, and a stage that also allows adding people
manually gets a mix of both. Where a side panel filters its roster, generation
draws only from the people that panel would actually show. A roster that loads
but has no rows — or whose panel filters out everyone — now generates an empty
roster stage rather than inventing people. Protocols whose roster files are
missing or unreadable still generate as before.
