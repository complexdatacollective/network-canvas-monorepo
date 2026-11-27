<!--
  Walkthrough for the "Ego Form" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (EgoForm.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: prompts" wrapped in an HTML comment:
      section: <key>     highlight and scroll to the editor section with this
                         key (its data-section-key; the keys are listed in
                         protocol-builder's sections/sectionKeys.ts)
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      control: <name>    highlight a control outside the sections instead
                         (only "preview": the toolbar's Preview button)
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (skip logic, interviewer guidance and so on);
    edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Ego Form

## What an ego form is

<!-- scene: ego-form-intro -->

The Ego Form collects data about the participant via a configurable [form](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms). A heading and some text at the top of the form can explain what the questions are for.

Read the full [Ego Form documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/ego-form).

## When to use it

Use this stage to ask the participant a few questions about themselves.

> Do: Use it as a simple way to collect attribute data on each participant in your study.

> Avoid: Overloading the form with too many fields or text-heavy questions, which make it burdensome to complete.

## Build the form

<!-- section: form-fields -->
<!-- scene: ego-form-intro -->

The form contains questions the participant answers about themselves. Each field records one attribute of the participant.

Start the form with a heading and a short introduction, so the participant knows what the questions are for before they start. To make a line a heading, choose a heading in the toolbar's list of text styles.

<!-- include: form-document -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
