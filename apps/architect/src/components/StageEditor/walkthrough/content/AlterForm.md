<!--
  Walkthrough for the "Per Alter Form" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (AlterForm.md).
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

# Per Alter Form

## What a per alter form is

<!-- scene: alter-form-intro -->

The Per Alter Form is a name interpreter. It collects information about alters already named, rather than creating new ones. The participant completes the same [form](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms) for each alter in turn. The alter is shown beside the form, or above the form on a screen taller than it is wide. The participant moves on to the next alter with the Next arrow.

Read the full [Per Alter Form documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/per-alter-form).

## What data it collects

<!-- scene: name-generator-data -->

This stage collects attributes about alters already named. Each field on the form records one attribute of the alter. In your exported data, each alter the form is shown for is one row, and each field is one column.

## When to use it

Use this stage to ask the same few questions about every alter.

> Do: Use it as a simple way to collect data on alters systematically.

> Do: Place an [Information](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/information) stage before it, to tell participants about the form they will complete for each alter.

> Avoid: Too many fields or text-heavy questions. Consider more interactive interfaces, such as the [Categorical Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/categorical-bin) and [Ordinal Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/ordinal-bin), to ease participant burden.

## Choose what this stage shows

<!-- section: Node setup -->

Choose the **node type** the form asks about, such as _Person_. The form is shown once for every node of that type already in the participant's network.

Changing the node type later clears this stage's other settings, except its name and interviewer notes, because they depend on the node type. Architect asks you to confirm first.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Build the form

<!-- section: Form configuration -->
<!-- scene: alter-form-intro -->

These are the questions asked about each alter. Each field records one attribute of the alter, and the fields appear in the order listed here. The form has no title of its own. Instead, the alter the form asks about is shown beside it.

Read more about [forms](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms). To tour the field editor, open a field or create a new one.

<!-- include: node-form-field -->

<!-- include: form-field-details -->

<!-- include: attribute-search -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
