<!--
  Walkthrough for the "Sociogram" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Sociogram.md).
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

# Sociogram

## What a sociogram is

<!-- scene: sociogram-intro -->

The Sociogram interface is a core part of a Network Canvas interview. It is simultaneously a name interpreter and edge generator. Participants can position alters on a canvas, draw edges between them, and tap an alter to assign an attribute. The Sociogram does not create new nodes.

Read the full [Sociogram documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/sociogram).

## When to use it

Use this stage when you want participants to build a visual picture of their network by positioning alters, drawing the ties between them, and marking a yes/no attribute, such as group membership, directly on the canvas.

<!-- include: node-type -->

<!-- include: filter-network -->

## Write the prompts

<!-- section: prompts -->

Each prompt configures a task, such as placing nodes, connecting nodes, or assigning an attribute. The participant works through the prompts one at a time, in the order you set, on the same canvas. The Next and Back buttons control moving between prompts.

Prompts that use the same **Layout attribute** share one spatial arrangement, so positions carry over from one prompt to the next. A prompt with a different layout attribute moves the nodes to the positions specified in the new attribute.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

<!-- include: background -->

## Choose how nodes are first arranged

<!-- section: node-layout -->
<!-- scene: sociogram-layout-mode -->
<!-- field: behaviours.automaticLayout -->

In **Manual mode**, nodes that have not been placed yet wait in a bucket at the bottom of the screen. The participant drags each node onto the canvas, and can drag a node back to the bucket to remove it from the canvas.

In **Automatic mode**, Network Canvas arranges the nodes for the participant when the stage opens by simulating attraction and repulsion. The participant can pause the simulation and move nodes while it is paused.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
