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
  visible after the passphrase is replaced with one that cannot read them,
  including in the Family Pedigree.
- Stages no longer take protected answers they cannot save. Until a working
  passphrase is entered, the name generators, the roster, forms, the category
  "other" question and the map ask for the passphrase instead.
- When a save is refused, the answers just typed stay on screen with a message
  that they were not saved, so the participant can enter the passphrase and
  try again. Before, they could disappear without a word. The form for adding
  or editing a person and the category "other" question offer the passphrase
  inside the form, so the answers can be saved without closing it.
- A save is refused if the passphrase is replaced, or found not to work, while
  the save is under way. Before, the answer was still saved with the earlier
  passphrase, which the one now in use might not be able to read.
- A saved location that is protected is shown on the map when the participant
  returns to it.
- Replacing a protected answer with an unprotected one no longer leaves the
  answer unreadable.
- Saving a form no longer erases a protected answer the form could not show.
  Before, an answer saved without the details needed to read it appeared
  empty, and saving the form after changing any other answer deleted it. Now
  it is kept unless the participant enters a new answer in its place.
- The passphrase prompt cannot be closed while it checks a passphrase, and the
  form for adding or editing a person cannot be closed while it saves. Before,
  either could be closed and still take effect afterwards, and pressing
  Finished again during a save could add the same person twice.
- Browsers and password managers no longer offer to save or fill in the
  passphrase.
- The category "other" question shows a protected name as it was entered,
  not in its scrambled form.
- Outside development, the interview no longer shares its state with the
  Redux DevTools browser extension. In development, protected answers and the
  passphrase are hidden from the extension and from the action log.
- Names added in the Network Composer and the Family Pedigree, and protected
  answers brought in from a side panel on a name generator, were saved without
  protection. They are now protected like every other answer, and these stages
  ask for the passphrase before they show or save them.
- Undoing or redoing a change in the Network Composer keeps protected names
  readable.
- A family pedigree is saved whole or not at all. If a relative's name cannot
  be saved, nothing is saved, the participant is told why, and they can enter
  the passphrase and save the pedigree again.
- The Family Pedigree and Narrative Pedigree stages read only the protected
  answers they show or edit. Before, a relative's other protected answer that
  the passphrase could not read, such as one saved with a different
  passphrase by an earlier version, hid every name and marked the passphrase
  as not working.
- Questions that compare an answer with other answers, such as a name that
  must not repeat or an answer that must match another one, now compare with
  the protected answers as they were entered. Before, they compared with the
  stored, scrambled form, so a repeated name was accepted. This includes a
  relative's name in the Family Pedigree. Only the protected answers a
  question compares with need to be readable, so another protected answer
  that cannot be read no longer stops the question being checked. If the
  answers it compares with cannot be read, the question says so and asks for
  the passphrase instead of accepting the answer.
