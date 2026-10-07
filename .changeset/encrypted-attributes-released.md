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
upgrade when they update the protocols they already hold, including Fresco
protocols that the schema 8 alpha stored with name encryption on.

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
- The passphrase prompt now also appears when the navigation runs along the
  bottom of the screen, and a notice that answers are protected brings it
  up. Password managers are asked to stay out of it too, and it can't be
  closed while it checks a passphrase. It starts empty each time it opens,
  even when it is opened again as it closes.
- The interview checks how its key is made before making one. If that record
  is damaged, or was written by a newer version, no passphrase is asked for,
  because none could be accepted. Protected answers show as "Answer
  unavailable", and the participant is told they can't be shown or saved.
  The interview can still go on: forms open with their other questions, a
  name generator's minimum number of people no longer holds the participant
  back, and a family pedigree that would save protected names is replaced by
  a notice.
- An answer that can't be read is shown as "Answer unavailable" rather than
  asking for the passphrase again. Saving a form keeps such an answer instead
  of clearing it, and the participant can replace it with a new one.
- Whether an answer is read as encrypted follows how it was saved, not the
  protocol's current setting.
- A validation rule that compares an answer with protected ones, such as
  "must be different from" or "must be unique", uses the decrypted answers.
  While the passphrase hasn't been entered, the check asks for it instead of
  passing or comparing with encrypted text.
- A form shown over the screen, such as the add-a-person form, the "Other"
  question of a categorical bin, or a family pedigree's person forms, now
  offers the passphrase itself when one of its rules needs it, because the
  prompt in the navigation can't be reached while the form is open. A rule
  asks for the passphrase only when it reads a protected answer: a new
  person's form no longer asks for it to check the new person's own answers,
  which aren't saved yet.
- A protected name is shown decrypted in a person's label and in the "Other"
  prompt of a categorical bin.
- A list sorted by a protected answer, such as a name, is sorted by the
  decrypted answers once the passphrase has been entered. Until then, and
  when an answer can't be read, the list ignores that sort rule and keeps the
  order its other rules give it, so the order never hints at what the answers
  say.
- Typing a letter to move through a list of people finds them by their
  decrypted names once the passphrase has been entered. Until then, typing
  never finds anyone by a protected name, and a name that can't be read is
  found by "Answer unavailable", as it is shown.
- The add-a-person form can't be closed or submitted twice while it saves.
  A family pedigree is saved all at once or not at all, and a relationship
  that can't be saved is reported rather than skipped. Choosing to keep
  editing while it is being saved saves none of it, so finalizing it again
  saves each relative once.
- Going back from the first person or relationship in a form now saves the
  answers, or asks before discarding answers that can't be saved, as going
  back from any other person does. Leaving a Network Composer stage saves a
  change in its side panel that hadn't been saved yet, and asks before
  discarding one that is invalid or couldn't be saved.
- An area picked on the map is highlighted once it is saved, so a pick that
  couldn't be saved, such as a protected location picked before the
  passphrase was entered, no longer looks chosen. The map highlights only the
  location saved for the person shown, even when moving on while it is still
  loading.
- The summary of the family that a family pedigree saves alongside the
  interview names a relative whose name is protected by their relationship
  alone, so a protected name never reaches it, even inside another
  relative's label, such as "Rosa's Parent".

Skip logic and filters are checked without the participant's passphrase, so a
rule on an encrypted attribute could only ever compare its encrypted text.
Architect no longer offers encrypted attributes when you build skip logic, a
stage filter or a panel filter, except in a panel that lists people from an
external data file, whose rows are not encrypted. It won't let you encrypt an
attribute that one of these rules uses until the rule is removed or changed.
Upgrading a protocol to schema 9 removes such rules.

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
`{ iv }`, and schema 8's `{ iv, salt }` is still accepted. Redux DevTools and
the interview's action logger now connect only when the host passes
`flags.isDevelopment`, and both show encrypted answers redacted.
