<!--
  Walkthrough for the "Per Alter Edge Form" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (AlterEdgeForm.md).
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

# Per Alter Edge Form

## What a per alter edge form is

<!-- scene: edge-form-intro -->

The Per Alter Edge Form is an edge interpreter: it collects information about edges already in the network, rather than creating new ones. The participant completes the same [form](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms) for each edge in turn. The two nodes the edge connects are shown above the form, and the participant moves on to the next edge with the Next button.

Read the full [Per Alter Edge Form documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-edge-form).

## When to use it

Use this stage to ask set questions about every edge of a given type.

> Do: Use it as a simple way to systematically collect edge attributes.

> Do: Place an [Information](https://documentation.networkcanvas.com/design-protocols/interface-documentation/information) stage before it, to orient participants to the form they will complete for each edge.

> Avoid: Overloading it with too many fields or text-heavy questions.

> Avoid: Using it in place of a [Dyad Census](https://documentation.networkcanvas.com/design-protocols/interface-documentation/dyad-census). It only asks about edges that already exist, not about every possible pair of alters.

## Choose which edges this stage shows

<!-- section: Edge setup -->
<!-- scene: edge-form-source -->

Choose the **edge type** the form asks about, such as _Knows_. The form is shown once for every edge of that type already in the participant's network. If there are no edges of that type, the stage is empty and will be automatically skipped.

Changing the edge type later clears this stage's other configuration, because they depend on the edge type.

<!-- include: edge-type -->

## Show the form for only some edges

<!-- section: Filter network -->

Switch on **Filter network** to narrow the network this stage works with. Filtering happens _before_ the available edges for this stage are calculated. If filtering removes the source or target node, the edge is also removed.

Without a filter, the form is shown for every edge of the chosen type.

Read more about [network filtering](https://documentation.networkcanvas.com/design-protocols/key-concepts/network-filtering).

<!-- include: rule -->

## Build the form

<!-- section: Form configuration -->

The form contains the questions asked about each edge. Each field records one attribute of the edge, and the fields appear in the order listed here.

Read more about [forms](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms). To tour the field editor, open a field or create a new one.

## Configure this field

<!-- dialog: form field -->
<!-- field: variable -->

Each field saves the participant's response to an **attribute** of the edge. Select an attribute this edge type already has, or create a new one.

<!-- include: form-field-details -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
