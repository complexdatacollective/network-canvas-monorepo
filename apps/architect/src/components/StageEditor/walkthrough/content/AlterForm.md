<!--
  Walkthrough for the "Per Alter Form" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (AlterForm.md).
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

# Per Alter Form

## What a per alter form is

<!-- scene: alter-form-intro -->

The Per Alter Form is a name interpreter: it collects attributes about alters already named, rather than creating new ones.

The participant completes the same [form](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms) for each alter in turn. The alter is shown next to the form, and the participant moves on to the next alter with the Next button.

Read the full [Per Alter Form documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-form).

## When to use it

Use this stage in situations where you want to follow-up about named alters, and capture a set of attributes in one go.

> Do: Use it as a simple way to collect multiple alter attributes systematically.

> Do: Place an [Information](https://documentation.networkcanvas.com/design-protocols/interface-documentation/information) stage before it, to tell participants about the form they will complete for each alter.

> Avoid: Too many fields or text-heavy questions. Consider more interactive interfaces, such as the [Categorical Bin](https://documentation.networkcanvas.com/design-protocols/interface-documentation/categorical-bin) and [Ordinal Bin](https://documentation.networkcanvas.com/design-protocols/interface-documentation/ordinal-bin), to ease participant burden.

## Choose what this stage shows

<!-- section: node-type -->

Choose the **node type** that this stage uses. The form is shown once for every node of this type already in the participant's network.

If you create a new node type here, remember to also add a name generator interface using this type before this stage.

Changing the node type later clears this stage's other configuration.

<!-- include: stage-filter -->

## Build the form

<!-- section: form-fields -->
<!-- scene: alter-form-intro -->

The form contains the questions asked about each alter. Each field records one attribute of the alter, and the fields appear in the order listed.

Read more about [forms](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
