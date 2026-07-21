---
'@codaco/architect': minor
---

Synthetic preview sessions now draw roster-stage people from the protocol's
actual roster assets instead of inventing them, so a preview lines up with the
roster file the way a real interview would. A roster that is missing or
unreadable — including a half-built draft stage — falls back to generated
people, so a roster problem never blocks a preview.
