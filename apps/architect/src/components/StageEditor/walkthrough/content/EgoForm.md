<!--
  Walkthrough for the "Ego Form" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (EgoForm.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images, > quotes).
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

The Ego Form collects data about the participant via a configurable [form](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms). An introduction above the form explains what the form is for.

Read the full [Ego Form documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/ego-form).

## When to use it

Use this stage to ask the participant a few questions about themselves.

> Do: Use it as a simple way to collect attribute data on each participant in your study.

> Avoid: Overloading the form with too many fields or text-heavy questions, which make it burdensome to complete.

## Introduce the form

<!-- section: introduction -->
<!-- field: introductionPanel.title -->
<!-- scene: ego-form-introduction -->

The introduction sits above the form, so the participant knows what the questions are for before they start. The **Title** is required and is shown as the introduction's heading. The **Introduction text** below the title is optional.

## Build the form

<!-- section: form-fields -->
<!-- scene: ego-form-intro -->

The form contains questions the participant answers about themselves. Each field records one attribute, and the fields appear in the order listed here.

For a new attribute, the input control you choose for its field also sets the kind of data the attribute holds.

Read more about [forms](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms).

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
