<!--
  Walkthrough for the "Per Alter Edge Form" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (AlterEdgeForm.md).
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

<!-- include: edge-type -->

<!-- include: filter-network -->

## Build the form

<!-- section: form-fields -->

The form contains the questions asked about each edge. Each field records one attribute of the edge, and the fields appear in the order listed.

Read more about [forms](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
