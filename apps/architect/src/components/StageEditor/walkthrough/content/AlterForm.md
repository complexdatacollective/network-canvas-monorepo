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

The Per Alter Form is a name interpreter: it collects information about alters already named, rather than creating new ones. The participant completes the same [form](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms) for each alter in turn, with the alter shown above it, and moves on to the next one with the Next arrow.

Read the full [Per Alter Form documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/per-alter-form).

## What you get

<!-- scene: name-generator-data -->

Each field on the form records one attribute of every alter it is shown for, so in your exported data each field becomes a column, with a row for each alter.

## When to use it

Use this stage to ask the same few questions about every alter.

> Do: Use it as a simple way to collect data on alters systematically.

> Do: Place an [Information](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/information) stage before it, to tell participants about the form they will complete for each alter.

> Avoid: Too many fields or text-heavy questions. Consider more interactive interfaces, such as the [Categorical Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/categorical-bin) and [Ordinal Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/ordinal-bin), to ease participant burden.

## Choose what this stage shows

<!-- section: Node setup -->

Pick the **node type** the form is about, for example _Person_. The form is shown once for every node of that type already in the participant's network.

Changing the node type later clears the rest of this stage's settings, since they all describe the type chosen now.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Build the form

<!-- section: Form configuration -->
<!-- scene: alter-form-intro -->

These are the questions asked about each alter. Each field records one attribute of the alter, and the fields appear in the order listed here. The form has no title of its own: the alter it is about is shown above it.

Read more about [forms](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms), and open a field, or create a new one, for a tour of the field editor.

<!-- include: form-field -->

<!-- include: attribute-picker -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
