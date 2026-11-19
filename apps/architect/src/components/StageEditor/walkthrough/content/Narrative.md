<!--
  Walkthrough for the "Narrative" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Narrative.md).
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

# Narrative

## What a narrative is

<!-- scene: narrative-intro -->

The Narrative interface is designed to show the participant's network back to them for discussion. The interviewer or participant switches between **presets**, with each preset representing a different view of the network. A preset sets which edges are drawn, which nodes are grouped, and which nodes are highlighted. A Narrative stage does not create data.

Read the full [Narrative documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/narrative).

## When to use it

Use this stage to talk through the network with the participant after they have built it, for example to ask about the groups in it or about who provides support.

This stage collects no data, so plan separately how you will capture the discussion, for example with screen and audio recording.

<!-- include: node-type -->

<!-- include: filter-network -->

## Build the presets

<!-- section: presets -->

A preset is a customized view of the network designed to promote a specific kind of discussion. The participant sees the first preset when the stage opens, and steps through the others in order with the arrows in the preset switcher at the bottom right of the screen. Every Narrative stage needs at least one preset.

> Do: Give each preset a single focus that maps to one question, and label it accordingly, for example a _Support_ preset that highlights who provides support, or a _Groups_ preset that shows how the network divides into communities.

> Avoid: Crowding a single preset with every group, edge type and attribute at once. A dense view is hard to read and hard to discuss; separate concerns into distinct presets and switch between them.

<!-- include: background -->

## Arrange nodes automatically

<!-- section: canvas-permissions -->
<!-- field: behaviours.automaticLayout -->

With **Automatic layout** on, Network Canvas moves the nodes by simulating attraction and repulsion. The simulation starts from the nodes' saved positions and pulls grouped nodes together. A pause button in the toolbar at the bottom left stops and restarts the simulation. With **Automatic layout** off, nodes stay exactly where the layout attribute puts them. New Narrative stages start with **Automatic layout** and **Allow repositioning** switched on.

## Allow drawing on the canvas

<!-- section: canvas-permissions -->
<!-- field: behaviours.freeDraw -->
<!-- scene: narrative-draw -->

With **Free-draw** on, the interviewer or participant can draw on the canvas with the pencil in the toolbar at the bottom left. Each line fades away after it is drawn, unless the freeze button is on. The reset button clears every line. Drawings are a live aid to discussion and are never saved.

## Allow moving nodes

<!-- section: canvas-permissions -->
<!-- field: behaviours.allowRepositioning -->

With **Allow repositioning** on, nodes can be dragged around the canvas while you talk. Moved nodes keep their new places only while the stage is on screen, and the positions saved in the layout attribute never change.

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
