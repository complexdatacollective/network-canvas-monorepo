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
  A passphrase box that opens over the interview is emptied as soon as it
  closes, even if it is opened again straight away.
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
  or editing a person, the category "other" question and the Family Pedigree's
  questions about a relative offer the passphrase inside the form whenever
  saving can need it: to protect an answer, or to check an answer against a
  protected one. The answers can then be saved without closing the form.
- A save is refused if the passphrase is replaced, or found not to work, while
  the save is under way. Before, the answer was still saved with the earlier
  passphrase, which the one now in use might not be able to read.
- A saved location that is protected is shown on the map when the participant
  returns to it, and stops being shown once the passphrase is replaced or
  found not to work. An area picked on the map is highlighted once it is
  saved, so a pick that could not be saved no longer looks chosen.
- Answers changed one after another in the Network Composer's side panel, and
  locations picked one after another on the map, are saved in the order they
  were made. Before, an earlier answer that took longer to protect could be
  saved last and replace the later one, and an answer put back while an
  earlier one was still being protected could be lost.
- Leaving a stage, moving to the next or previous question on a stage (or
  to the next person on the map), finishing or closing the interview waits
  for answers still being protected, including answers still waiting for an
  earlier one to be saved and names still being checked, so they are kept
  and the next stage is chosen with them. When one of them cannot be saved,
  the participant stays where they are and the interview is not finished or
  closed, so they see why and can try again. The confirmation to close the
  interview stays open while it waits, and cancelling it keeps the interview
  open. Before, a location picked or a name added just before pressing Next
  could be lost or kept under the wrong question, and an answer still being
  protected could be left out of the stage that came next and of the
  interview handed back when finishing or closing.
- Replacing a protected answer with an unprotected one no longer leaves the
  answer unreadable.
- Saving a form no longer erases a protected answer the form could not show.
  Before, an answer saved without the details needed to read it appeared
  empty, and saving the form after changing any other answer deleted it. Now
  it is kept unless the participant enters a new answer in its place.
- The passphrase prompt cannot be closed while it checks a passphrase, the
  form for adding or editing a person cannot be closed while it saves, and
  the field for adding a name in the Network Composer or on a name generator
  stays open while it checks and adds a name. Before, any of them could be
  closed and still take effect afterwards, a name that could not be added was
  lost, and pressing Finished again during a save could add the same person
  twice.
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
- While names are protected, the summary of the family that the Family
  Pedigree saves as plain text names each relative by their relationship to
  the participant. Before, it held protected names, both as a relative's own
  label and inside another relative's, such as "Alice's Parent".
- Undoing or redoing a change in the Network Composer keeps protected names
  readable.
- A family pedigree is saved whole or not at all. If a relative's name cannot
  be saved, nothing is saved, the participant is told why, and they can enter
  the passphrase and save the pedigree again. Choosing to keep editing while
  the pedigree is being saved now saves none of it.
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
  question compares with need to be readable: a question that must match
  another of the same person's answers reads only that person's answers, and
  a name that must not repeat reads only everyone else's. Another protected
  answer that cannot be read no longer stops the question being checked. If
  the answers it compares with cannot be read, the question says so and asks
  for the passphrase instead of accepting the answer. A question that waits
  for those answers to be read compares with them as they are once the wait
  is over, including a person added meanwhile.
- Answers being typed are kept when the passphrase is replaced with one that
  cannot read them. The Network Composer's side panel, the questions asked
  about each person or relationship, and the form for adding or editing a
  person hide those answers and save none of them until the passphrase that
  reads them is back, then show them as they were left. The side panel then
  saves them and removes its message that they were not saved. Before, they
  were lost. Leaving such a question before then warns that its answers have
  not been saved.
- Going back from the first person or relationship on a stage that asks
  about each one saves the answers entered, or warns that they have not been
  saved, as going forward does. Before, they were lost.
