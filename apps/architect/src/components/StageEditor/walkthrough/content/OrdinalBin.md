<!--
  Walkthrough for the "Ordinal Bin" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (OrdinalBin.md).
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

# Ordinal Bin

## What an ordinal bin is

<!-- scene: ordinal-bin-intro -->

The Ordinal Bin is a name interpreter: it collects information about alters already named, rather than creating new ones. Participants place each alter from the drawer at the bottom of the screen into a **bin**, which represents one option value of an ordinal attribute.

Read the full [Ordinal Bin documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/ordinal-bin).

## When to use it

Use this stage to collect ordinal data by visually classifying alters on an ordered scale.

> Do: Use it to collect ordinal or interval scale data on alters. A Likert scale [input control](https://documentation.networkcanvas.com/design-protocols/key-concepts/input-controls) on another interface can collect the same data, but dragging alters into bins is more tactile and engaging for participants.

> Avoid: Scales of more than six bins. Larger scales make the bin labels hard to read and crowd the rest of the screen.

<!-- include: node-type -->

<!-- include: filter-network -->

## Write the prompts

<!-- section: prompts -->

Each prompt asks the participant to sort alters by an ordinal attribute. The participant sees one prompt at a time, in the order you set. This stage can have multiple prompts, and pressing the Next or Back buttons switches between them.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

<!-- include: placing-nodes -->

<!-- include: require-placement -->

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
