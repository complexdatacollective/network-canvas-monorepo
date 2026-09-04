---
'@codaco/interview': patch
---

Analytics now reports a session-scoped pseudonym for every entity id, rather
than the interview's own `_uid`.

The event taxonomy admits `node_id` and `edge_id` on the premise that they are
random values minted at creation time, derived from nothing a participant
supplied. Roster nodes break that premise: an external-data row is keyed as
`${subjectType}_${hash({ node, index })}`, a deterministic, unkeyed digest of
the row's own content, and the node is added to the network under exactly that
key. Anyone holding the roster could recompute the digest and so recognise
which roster row an event was about, and because the digest does not vary the
same person carried the same identifier in every interview — so events from
separate sessions about one person could be joined together.

Each session now mints a random pseudonym per entity, held in memory and never
persisted or transmitted. Events within a session still join on the entity,
which is all these properties are for; nothing joins across sessions or back to
a roster row. The substitution happens at the tracker, the single boundary every
event passes through, so no emitter can reintroduce a raw identifier. When
events fire, and which events fire, is unchanged.
