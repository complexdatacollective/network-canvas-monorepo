---
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': patch
'@codaco/architect': patch
---

The Codebook now shows every place a variable is used, keyboard navigation lands where it says it does, and a very long variable name no longer breaks its own delete confirmation.

**"Used In" now agrees with the delete button.** A variable could sit in the Codebook marked "In use — cannot be deleted" with nothing at all in its "Used In" column, because two of the places a variable can be referenced never reached the list of usages the column is built from. Prompt sort orders were collected in a format the column could not read, so a variable used only to sort a Sociogram, an Ordinal Bin, a Categorical Bin or a One-to-Many Dyad Census vanished from the column while still counting as in use. Name Generator Roster card, search and sort columns were not collected at all — so a variable that only a roster reads was reported as unused, and the Codebook offered to delete it. Both now come from the same source as every other reference, so the two can no longer disagree, and the Protocol Summary's own "Used In" column gains the same references. That column now also names each stage once: a stage that reads one variable in several ways — as a prompt's variable and as that prompt's sort key, or as two columns of the same roster — used to be listed once per reference.

**Deleting an in-use variable now says why it was refused.** It was already refused, but silently: the confirmation closed as though the variable had been deleted, and it was still there when the page redrew. The dialog now stays open and explains that the variable is in use.

**Following a "Used In" link puts you where you were sent.** Activating one with the keyboard left focus at the top of the document, so the next Tab restarted at the header rather than continuing into the stage editor. Every page now has a heading that a route change moves focus to and announces, and the stage editor gained the first-level heading it never had.

**A long variable name no longer breaks the confirmation.** A researcher-authored name can run to hundreds of characters with nowhere to break; interpolated into the confirmation's action button it pushed Cancel outside the dialog and off the screen, leaving an invisible control holding the keyboard default. Delete confirmations now use fixed action labels and carry the name in their body text, which wraps. Underneath that, buttons across the design system give way to the space they are in instead of forcing it wider, and headings and body text break an over-long word rather than overflowing.

For protocol authors, nothing about a protocol file changes and nothing needs re-saving. Sort keys and roster columns are read as possible variable references but are never required to be one, so a protocol that opens today still opens.
