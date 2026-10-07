---
'@codaco/interview': major
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Encrypted attributes are no longer an experimental feature. The Anonymisation
interface, which asks a participant for a passphrase and encrypts the
attributes you choose so that researchers can't read them, is now always
available when you add a stage in Architect. Architect's Experimental Features
page, where encrypted attributes had to be switched on for each protocol, has
been removed.

In interviews, an attribute marked as encrypted is now always encrypted.
Upgrading a protocol to schema 9 keeps each attribute working as it did: if a
protocol marked attributes as encrypted but had the experimental feature
switched off, the upgrade unmarks them, so they go on being collected without
encryption. Fresco and Interviewer carry each protocol's setting into the
upgrade when they update the protocols they already hold.

Encrypted answers are now protected in a new way:

- Each interview has one encryption key, made from the participant's
  passphrase with PBKDF2-SHA256 (600,000 iterations and a random salt for the
  interview) and used with AES-256-GCM. The key is made once when the
  passphrase is chosen and once each time it is entered again, and is only
  ever held in memory: it is never saved, synced or exported.
- The interview records how its key is made, with a check value, alongside
  its network. A passphrase is accepted only if it opens the check value, so
  a mistyped passphrase is turned away at once, even before any answer has
  been encrypted, instead of failing later.
- Each answer is bound to the person and the question it belongs to, so an
  encrypted answer copied anywhere else can't be read, and it is padded so
  that its length reveals less about it.
- A participant now confirms the passphrase when choosing it. Entering it
  again only checks it. A minimum length set on the Anonymisation stage
  applies even if it is shorter than 8. Without one, the passphrase must be
  at least 8 characters long, or as long as the stage's maximum when that is
  shorter. Architect shows the minimum that applies where you set the lengths.
- The passphrase stage now says whether the passphrase was set, accepted, or
  had already been entered. Password managers are asked not to fill in or
  save it, and when a passphrase is turned away the cursor goes back to the
  field so it can be typed again.
- While a passphrase is being checked, the interview says so and the button
  can't be pressed twice.
- The passphrase prompt now says that a forgotten passphrase can't be
  recovered, instead of suggesting someone can help.
- The interview checks how its key is made before making one. If that record
  is damaged, or was written by a newer version, no passphrase is asked for,
  because none could be accepted: the protected answers show as "Answer
  unavailable", the participant is told they can't be shown or saved, and
  the interview can go on.
- An answer that can't be read is shown as "Answer unavailable" rather than
  asking for the passphrase again.
- A validation rule that compares an answer with an encrypted one, such as
  "must be different from", no longer passes while the passphrase has not
  been entered: it compares with the decrypted answer once it has.

Answers encrypted by the experimental feature in schema 8 can't be read after
the upgrade, and a forgotten passphrase still can't be recovered. A schema 8
interview with encrypted answers still opens, syncs and exports as before:
its old encrypted answers show as "Answer unavailable" and export as
`ENCRYPTED`, and if the participant continues, they choose a new passphrase
that protects the answers they give from then on.

For hosts of `@codaco/interview`: `ProtocolPayload` no longer has
`experiments`, and the engine no longer reads it. A session's network can now
carry an `encryption` header, which must be stored and returned with the rest
of the network; without it, the interview treats the passphrase as never
chosen and earlier encrypted answers can no longer be read. A header outside
the runtime's bounds is left as it is. Encrypted values' metadata is now
`{ iv }`, and schema 8's `{ iv, salt }` is still accepted.
