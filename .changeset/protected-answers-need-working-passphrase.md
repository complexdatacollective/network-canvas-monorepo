---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Interviews that protect some answers with a passphrase now keep those answers
safe and readable. These changes apply only to studies that turn on encrypted
answers; other interviews work as before.

- A passphrase is now checked when it is entered. If it does not match the one
  used earlier in the interview, a message under the field says so and the
  participant can try again. Before, a mistyped passphrase was accepted and
  could protect new answers that could then never be read alongside the
  earlier ones. The passphrase box in the navigation also hides what is typed.
- Protected answers stay locked when an interview is resumed, until the
  passphrase is entered again. Names that had been unlocked no longer stay
  visible after the passphrase is cleared.
- Stages no longer take protected answers they cannot save. Until a working
  passphrase is entered, the name generators, the roster, forms, the category
  "other" question and the map ask for the passphrase instead.
- When a save is refused, the answers just typed stay on screen with a message
  that they were not saved, so the participant can enter the passphrase and
  try again. Before, they could disappear without a word.
- A saved location that is protected is shown on the map when the participant
  returns to it.
- Replacing a protected answer with an unprotected one no longer leaves the
  answer unreadable.
- Names added in the Network Composer and the Family Pedigree, and protected
  answers brought in from a side panel on a name generator, were saved without
  protection. They are now protected like every other answer, and these stages
  ask for the passphrase before they show or save them.
- Undoing or redoing a change in the Network Composer keeps protected names
  readable.
- A family pedigree is saved whole or not at all. If a relative's name cannot
  be saved, nothing is saved, the participant is told why, and they can enter
  the passphrase and save the pedigree again.
- Questions that compare an answer with other answers, such as a name that
  must not repeat or an answer that must match another one, now compare with
  the protected answers as they were entered. Before, they compared with the
  stored, scrambled form, so a repeated name was accepted.
