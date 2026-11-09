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

The Anonymisation stage asks the participant to choose a passphrase and to type it a second time to confirm it. The passphrase protects the answers to the node attributes you choose to encrypt: the interview encrypts them on the participant's device before saving them, so only someone who knows the passphrase can read them. The participant can't move forward from this stage until their passphrase has been accepted.

Read the full [Anonymisation documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/anonymisation).

## What data it collects

<!-- scene: anonymisation-data -->

The stage creates no nodes or edges, and the passphrase itself is never saved. The interview turns it into a key that is held only while the interview is open, and encrypts each answer to an encrypted attribute with that key before the answer is saved, wherever in the interview it is given. The interview data holds only the encrypted form.

Your exported data never contains these answers. In CSV and GraphML files, each encrypted answer is replaced by the text `ENCRYPTED`, and a node labeled by an encrypted attribute gets the GraphML label `Encrypted`.

A forgotten passphrase can't be recovered by anyone, including you. The answers it protects stay unreadable.

## When to use it

Use this stage when participants will give answers that no one else should read, such as the names of their alters. Answers to attributes you don't encrypt are saved and exported as usual.

> Do: Use this feature to encourage disclosure of sensitive information, such as names, in a way that makes participants feel secure about their privacy. This can lead to more honest and complete responses in interviews.

> Avoid: Using this interface for data that is not sensitive or does not require encryption. This interface is intended for use with sensitive data where privacy and security are paramount.

## Explain the passphrase

<!-- section: Task explanation -->
<!-- field: explanationText -->

The **Explanation** is what the participant reads above the passphrase fields. It is required. Start it with a heading, then tell participants what the passphrase protects, and that they will need it again if they come back to the interview.

> Do: Clearly communicate to participants how their data will be used and the importance of the passphrase for accessing their encrypted data, including that a forgotten passphrase cannot be recovered. This transparency builds trust and encourages participation.

## Set the passphrase length

<!-- section: Passphrase validation -->
<!-- field: validation -->
<!-- scene: anonymisation-rules -->

Switched off, a passphrase must be at least 8 characters long, with no longest length. Switch this section on to set a **Minimum text length**, a **Maximum text length**, or both. A minimum you set replaces the 8, even when it is shorter. With only a maximum shorter than 8, the minimum drops to that maximum, and the editor shows the minimum that applies.

The minimum can't be longer than the maximum, and the maximum must be at least one character. Switching the section off discards the lengths, and Architect asks before it does.

The lengths apply when a participant chooses their passphrase, to both fields. They don't apply when the participant enters the same passphrase again later.

> Do: Balance a strong passphrase that prevents unauthorized access to the encrypted data against the need for participants to remember it easily.

## Choose what the passphrase protects

<!-- section: Encrypted attributes -->

Each node type in your protocol has its own switch. Switch a type on, then tick the attributes of that type that should be encrypted. Only the text attributes of node types are offered, because the interview encrypts only text answers about nodes. Edge and ego attributes can't be encrypted.

## Encryption belongs to the attribute

<!-- section: Encrypted attributes -->

Ticking an attribute changes the attribute itself in your codebook, not this stage. Its answers are encrypted on every stage that collects them. The change is saved straight away, and cancelling your edits to this stage doesn't undo it.

Switching a node type off stops encrypting every attribute of that type at once. Architect asks you to confirm before it clears them.

## Rules can't compare encrypted answers

<!-- section: Encrypted attributes -->

Skip logic and filters are checked without the participant's passphrase, so they can't read encrypted answers. Architect won't encrypt an attribute while a rule in skip logic, a stage filter, or a side panel listing nodes from the interview compares its answers. Remove that rule first, or change it so it only checks whether the attribute is answered. A side panel listing nodes from a data file can still compare them, because that file is never encrypted.

## When participants enter it again

<!-- section: Encrypted attributes -->
<!-- scene: anonymisation-return -->

The key is held only while the interview is open. When the interview is opened again, for example after the page is reloaded, encrypted answers stay locked, and a node labeled by one shows a lock. A key button appears in the navigation bar for the participant to enter their passphrase, once, with no confirmation. A passphrase that doesn't match the one that encrypted their earlier answers is turned away.

<!-- include: skip-logic -->

<!-- include: rule -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
