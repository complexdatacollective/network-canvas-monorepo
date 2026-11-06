<!--
  Walkthrough for the "Ego Form" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (EgoForm.md).
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

# Ego Form

## What an ego form is

<!-- scene: ego-form-intro -->

The Ego Form collects data about the participant, known as **ego**, rather than about any alter. The participant completes one [form](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms) about themselves, below an introduction that says what the form is for.

Read the full [Ego Form documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/ego-form).

## What data it collects

<!-- scene: ego-form-data -->

Each field on the form records one attribute of ego. In your exported data the answers go in the ego list: one row for the interview, with a column for each field.

## When to use it

Use this stage to ask the participant a few questions about themselves.

> Do: Use it as a simple way to collect attribute data on each participant in your study.

> Do: Consider adding it toward the beginning of your protocol, to capture data on your participant before asking them about the alters in their network.

> Avoid: Overloading the form with too many fields or text-heavy questions, which make it burdensome to complete.

## Introduce the form

<!-- section: Task introduction -->
<!-- field: introductionPanel.title -->
<!-- scene: ego-form-introduction -->

The introduction sits above the form, so the participant knows what the questions are for before they start. The **Title** is required and shown as its heading. The **Introduction text** below it is optional.

## Build the form

<!-- section: Form configuration -->
<!-- scene: ego-form-intro -->

These are the questions the participant answers about themselves. Each field records one attribute of ego, and the fields appear in the order listed here, in one form the participant scrolls through.

Read more about [forms](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms), and open a field, or create a new one, for a tour of the field editor.

## Choose what this field records

<!-- dialog: form field -->
<!-- field: variable -->

Each field saves its answer to an **attribute** of ego. Select an ego attribute already in the codebook, or create a new one.

## Write the question

<!-- dialog: form field -->
<!-- field: prompt -->

This is the question the participant reads above the input, such as _"How old are you?"_. It is asked once, about the participant themselves.

<!-- include: form-field-details -->

<!-- include: attribute-search -->

## Customize built-in wording

<!-- section: Customize built-in wording -->
<!-- scene: ego-form-scroll -->

When a form runs below the bottom of the screen and the participant has not touched it for 15 seconds, a button with bouncing arrows appears below the form. Pressing it scrolls to the end, and screen readers announce **Scroll to see more questions**. That wording is shared by every Ego Form stage, so changing it here changes it on all of them. The section appears once an Ego Form stage has been saved to the protocol.

Read more about [translating your protocol](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
