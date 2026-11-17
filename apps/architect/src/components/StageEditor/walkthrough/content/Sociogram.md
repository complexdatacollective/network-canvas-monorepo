<!--
  Walkthrough for the "Sociogram" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Sociogram.md).
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

# Sociogram

## What a sociogram is

<!-- scene: sociogram-intro -->

On the Sociogram, participants work with the alters they have already named. They position the alters on a canvas, draw edges between them, and tap an alter to highlight it. Each edge is saved as one of the stage's edge types, and highlighting an alter sets a true/false attribute to true for it. The Sociogram does not create new nodes.

Its companion, the [Narrative](https://documentation.networkcanvas.com/design-protocols/interface-documentation/narrative) Interface, displays a network the participant has already laid out so that it can be discussed. It collects no new data.

Read the full [Sociogram documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/sociogram).

## What data it collects

<!-- scene: sociogram-data -->

This stage can collect three kinds of data: where alters are placed, the edges between them, and which alters are highlighted.

- Positions: each alter's position on the canvas is saved to a layout attribute as a pair of coordinates. In your exported data, a layout attribute becomes two columns named after it, such as position\_x and position\_y.
- Edges: each edge the participant draws is saved as one of the stage's edge types, and becomes one row in the edge list.
- Highlighted alters: tapping an alter highlights it and sets a true/false attribute to true. Tapping it again sets the attribute to false, and an alter that is never tapped has no value for the attribute.

## When to use it

Use this stage when you want participants to build a visual picture of their network by positioning alters, drawing the ties between them, and marking a yes/no attribute, such as group membership, directly on the canvas.

> Avoid: Nodes positioned too close together may visually occlude one another, or the edge between them. Caution participants not to place nodes directly on top of one another.

## Choose what this stage shows

<!-- section: node-type -->

Choose the **node type** this stage places on the canvas, such as _Person_. Every node of that type that is already in the participant's network appears on this stage.

Changing the node type later clears this stage's other settings, because they depend on the node type. Only the stage's name and interviewer notes are kept. Architect asks you to confirm first.

<!-- include: stage-filter -->

## Write the prompts

<!-- section: prompts -->

Each prompt sets one task on the canvas, such as placing nodes, drawing one kind of edge, or marking nodes with a characteristic. The participant works through the prompts one at a time, in the order you set, on the same canvas.

Prompts that use the same **Layout attribute** share one arrangement, so positions carry over from one prompt to the next. A prompt with a different layout attribute starts a separate arrangement. Edges between the same two nodes are drawn on top of each other, so only one of them can be seen.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

## Choose the background

<!-- section: background -->
<!-- scene: sociogram-background -->

The background sits behind the whole stage. **Concentric Circles** draws a number of rings that you choose, and **Skew circle sizes** makes the inner rings larger, which can reduce crowding in the center. **Image** uses a picture of your own instead.

> Do: Consider customizing the background to orient participants to the activity or to give the layout meaning, for example dividing the canvas into quadrants or social contexts that positions can then be read against.

Read more about [responsive SVG backgrounds](https://documentation.networkcanvas.com/design-protocols/responsive-svg-backgrounds).

## Choose how nodes are first arranged

<!-- section: node-layout -->
<!-- scene: sociogram-layout-mode -->
<!-- field: behaviours.automaticLayout -->

In **Manual mode**, nodes that have not been placed yet wait in a bucket at the bottom of the screen. The participant drags each node onto the canvas, and can drag a node back to the bucket to remove it from the canvas.

In **Automatic mode**, Network Canvas arranges the nodes for the participant when the stage opens by simulating attraction and repulsion. The participant can pause the simulation and move nodes while it is paused.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
