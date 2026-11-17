<!--
  Walkthrough for the "Ordinal Bin" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (OrdinalBin.md).
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

# Ordinal Bin

## What an ordinal bin is

<!-- scene: ordinal-bin-intro -->

The Ordinal Bin is a name interpreter: it collects information about alters already named, rather than creating new ones. Participants drag each alter from the drawer at the bottom of the screen into a **bin**. The bins sit in a row and are ordered along a scale, such as from _Not close_ to _Extremely close_. After placing an alter, the participant can move it to another bin.

Read the full [Ordinal Bin documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/ordinal-bin).

## When to use it

Use this stage to rate alters on an ordered scale.

> Do: Use it to collect ordinal or interval scale data on alters. A Likert scale [input control](https://documentation.networkcanvas.com/design-protocols/key-concepts/input-controls) on another interface can collect the same data, but dragging alters into bins is more tactile and engaging for participants.

> Avoid: Scales of more than six bins. Larger scales make the bin labels hard to read and crowd the rest of the screen.

> Avoid: Collecting nominal data that would suit the [Categorical Bin](https://documentation.networkcanvas.com/design-protocols/interface-documentation/categorical-bin) better.

## Choose the node type

<!-- section: node-type -->

Choose the **node type** this stage sorts, such as _Person_. Every node of that type already in the participant's network waits in the drawer.

Changing the node type later clears this stage's other settings, because they depend on the node type.

<!-- include: stage-filter -->

## Write the prompts

<!-- section: prompts -->

Each prompt asks one question and sorts the alters by one ordinal attribute. The participant sees one prompt at a time, in the order you set. An alter waits in the drawer until it has a value for the current prompt's attribute, so if a prompt reuses an earlier prompt's attribute, the alters placed on the earlier prompt start out in their bins. The attribute's values become the bins, in the attribute's own order.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

## Choose how alters are placed

<!-- section: placing-nodes -->
<!-- field: behaviours.interactionMode -->
<!-- scene: ordinal-bin-tap -->

**Interaction mode** decides how the participant puts each alter into a bin. With **Drag and drop**, the participant drags each alter from the drawer at the bottom of the screen. With **Tap to place**, Network Canvas selects one alter in the drawer, the participant taps the bin that alter belongs in, and the next alter is selected.

## Require every alter to be placed

<!-- section: placing-nodes -->
<!-- field: behaviours.requireCompletePlacement -->
<!-- scene: ordinal-bin-require -->

Switch on **Require every node to be placed** to stop the participant from leaving a prompt while any alter is still in the drawer. If they try, they are told to place every alter first.

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
