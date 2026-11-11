<!--
  Walkthrough for the "Anonymisation" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Anonymisation.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images, > quotes).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: Participant prompts" wrapped in an HTML comment:
      section: <title>   highlight and scroll to the editor section whose
                         title this is
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
      dialog: <text>     a step for a dialog, not the editor: it is shown
                         only while a dialog whose title matches is open.
                         "form field" matches any title containing it
                         ("Create form field", "Edit form field");
                         "=attribute" matches a title that is exactly that;
                         alternatives are separated by "|". Dialog steps
                         play in order while it is open, and each dialog
                         keeps its place while another is opened from
                         inside it. The last one asks the researcher to
                         save (naming the dialog's own save button, e.g.
                         "Add") and rings that button, or, for a dialog
                         with no save button, to make their choice; once
                         the dialog closes the walkthrough picks up where
                         it was. Their "field:" looks inside the dialog.
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (node type, skip logic, interviewer guidance and
    so on); edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Anonymisation

## What an Anonymisation stage is

<!-- scene: anonymisation-intro -->

The Anonymisation stage asks the participant to choose a passphrase and to type it a second time to confirm it. The passphrase protects the answers to the node attributes you choose to encrypt. The interview encrypts these answers on the participant's device before saving them, so only someone who knows the passphrase can read them. The participant can't move forward from this stage until their passphrase has been accepted.

Read the full [Anonymisation documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/anonymisation).

## What data it collects

<!-- scene: anonymisation-data -->

This stage asks for a passphrase but never saves it, and it creates no nodes or edges. The interview turns the passphrase into a key, which it holds only while the interview is open. On any stage, an answer to an encrypted attribute is encrypted with that key before it is saved. The interview data holds only the encrypted answers.

Your exported data never contains these answers. In CSV and GraphML files, each encrypted answer is replaced by the text `ENCRYPTED`. In GraphML, a node whose label comes from an encrypted attribute gets the label `Encrypted`.

No one, including you, can recover a forgotten passphrase, and the answers it protects stay unreadable.

## When to use it

Use this stage when participants will give answers that no one else should read, such as the names of their alters. Answers to attributes you don't encrypt are saved and exported as usual.

> Do: Use this feature to encourage disclosure of sensitive information, such as names, in a way that makes participants feel secure about their privacy. This can lead to more honest and complete responses in interviews.

> Avoid: Using this interface for data that is not sensitive or does not require encryption. This interface is intended for use with sensitive data where privacy and security are paramount.

## Explain the passphrase

<!-- section: Task explanation -->
<!-- field: explanationText -->

The **Explanation** is what the participant reads above the passphrase fields, and it is required. Start it with a heading, then tell participants what the passphrase protects and that they will need it again if they come back to the interview.

> Do: Clearly communicate to participants how their data will be used and the importance of the passphrase for accessing their encrypted data, including that a forgotten passphrase cannot be recovered. This transparency builds trust and encourages participation.

## Set the passphrase length

<!-- section: Passphrase validation -->
<!-- field: validation -->
<!-- scene: anonymisation-rules -->

When this section is switched off, a passphrase must be at least 8 characters long, and there is no maximum length. Switch this section on to set a **Minimum text length**, a **Maximum text length**, or both. A minimum you set replaces the default of 8, even when it is shorter. If you set only a maximum and it is shorter than 8, the minimum becomes that maximum. The editor shows the minimum that applies.

The minimum can't be longer than the maximum, and the maximum must be at least one character. Switching the section off discards the lengths. Architect asks you to confirm first.

The lengths apply to both fields when the participant chooses their passphrase, but not when they enter the same passphrase again later.

> Do: Balance a strong passphrase that prevents unauthorized access to the encrypted data against the need for participants to remember it easily.

## Choose what the passphrase protects

<!-- section: Encrypted attributes -->

Each node type in your protocol has its own switch. Switch a node type on, then tick the attributes of that type that should be encrypted. Only text attributes of node types are offered, because the interview can encrypt only text answers about nodes. Edge and ego attributes can't be encrypted.

## Encryption applies everywhere the attribute is used

<!-- section: Encrypted attributes -->

Ticking an attribute changes the attribute itself in your codebook rather than this stage, so its answers are encrypted on every stage that collects them. The change is saved straight away, and canceling your edits to this stage doesn't undo it.

Switching a node type off stops encrypting every attribute of that type at once. Architect asks you to confirm first.

## Rules can't compare encrypted answers

<!-- section: Encrypted attributes -->

Skip logic and filters are checked without the participant's passphrase, so they can't read encrypted answers. Architect won't encrypt an attribute while any of these compares its answers: a rule in skip logic, a stage filter, or a side panel listing nodes from the interview. Remove that rule first, or change it so it only checks whether the attribute is answered. A side panel listing nodes from a data file can still compare that attribute's answers, because a data file is never encrypted.

## When participants return to the interview

<!-- section: Encrypted attributes -->
<!-- scene: anonymisation-return -->

The key is held only while the interview is open. When the interview is opened again, for example after the page reloads, encrypted answers stay locked. A node whose label comes from an encrypted answer shows a lock. A key button appears in the navigation bar so the participant can enter their passphrase again. They enter it only once, with no confirmation, and if the passphrase doesn't match the one that encrypted their earlier answers, it is rejected.

<!-- include: skip-logic -->

<!-- include: rule -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
