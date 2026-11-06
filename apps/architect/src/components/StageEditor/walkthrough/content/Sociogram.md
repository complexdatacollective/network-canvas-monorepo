<!--
  Walkthrough for the "Sociogram" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Sociogram.md).
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

# Sociogram

## What a sociogram is

<!-- scene: sociogram-intro -->

On the Sociogram, participants place the alters they have already named on a canvas, draw the edges between them, and mark nodes that share a characteristic. It does not create new nodes: it works with the alters named on earlier stages.

Its companion, the [Narrative](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/narrative), replays a network the participant has already laid out, for discussion, without collecting new data.

Read the full [Sociogram documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram).

## What data it collects

<!-- scene: sociogram-data -->

A sociogram can record three kinds of data:

- **Positions**: each node's place on the canvas, saved to a layout attribute as a pair of coordinates. In exported data it becomes two columns named after the attribute, such as `position_x` and `position_y`.
- **Edges**: every edge the participant draws becomes one row in the edge list.
- **Marked attributes**: a true or false attribute for each node, set by tapping it.

## When to use it

Use this stage when the arrangement of the network matters, or when you want participants to say which alters are connected by drawing it.

> Avoid: Nodes positioned so close together that they hide one another, or the edge between them. Caution participants not to place nodes directly on top of one another.

## Choose what this stage shows

<!-- section: Node setup -->

Pick the **node type** placed on this canvas, for example _Person_. Every node of that type already in the participant's network appears here.

Changing the node type later removes the rest of this stage's settings, apart from its name and interviewer notes, since they all describe the type chosen now. Architect asks before it does.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Write the prompts

<!-- section: Prompt collection -->

Each prompt sets one task on the canvas, such as placing nodes, drawing one kind of edge, or marking nodes with a characteristic. The participant moves through the prompts in order, on the same canvas.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the instruction the participant reads in the prompt card over the canvas, which they can drag out of the way, such as _"Place the people who know each other close together."_ or _"Drag the places you visit every week into the inner circle."_

> Do: Match each prompt's wording to its tap behaviour: ask about relationships on edge-creation prompts, and about a characteristic of individual alters on attribute-toggling prompts.

## Choose where positions are saved

<!-- dialog: create prompt | edit prompt -->
<!-- scene: sociogram-shared-layout -->
<!-- field: layout.layoutVariable -->

The **Layout attribute** stores where each node is placed while this prompt is on screen. Prompts that share one layout attribute share one arrangement, so positions carry over from prompt to prompt. A different layout attribute starts a separate arrangement. To make a new one, type its name in the picker and create it; no window opens, since a name is all a position attribute needs.

> Do: Keep the same layout attribute across a stage's prompts when you want participants to build up one arrangement of their network, so the positions they set on an early prompt are still there on later ones.

Read more about [variables](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/variables).

## Order the nodes waiting to be placed

<!-- dialog: create prompt | edit prompt -->

In manual layout, the nodes not yet placed wait in a bucket at the bottom of the screen. Switch on **Sort unplaced nodes** to set the order they are handed over in, by one or more attributes. Without sort rules, they come in the order they were added.

## Choose what tapping does

<!-- dialog: create prompt | edit prompt -->
<!-- scene: sociogram-tap -->

Switch on **Node interaction** to make tapping a node do something:

- **Edge creation**: tapping one node and then another draws an edge of the chosen type between them. Tapping the pair again removes it.
- **Attribute toggling**: tapping a node switches a true or false attribute, and nodes whose value is true are highlighted.

For attribute toggling, pick a **Boolean attribute**, or type a new name in the picker to create one.

A prompt uses one or the other, or neither while the section is switched off. Each edge-creation prompt creates one edge type, so ask about each kind of relationship on its own prompt.

## Choose which edges are shown

<!-- dialog: create prompt | edit prompt -->
<!-- scene: sociogram-display-edges -->
<!-- field: edges.display -->

**Displayed edges** decides which edge types are drawn while this prompt is on screen, for example to show the edges drawn on an earlier prompt. Choosing an edge type for edge creation ticks it here, so participants see the edges they draw. Edges between the same two nodes are drawn on top of each other, so only one of them can be seen.

<!-- include: edge-type -->

## Choose the background

<!-- section: Background -->
<!-- scene: sociogram-background -->

The background sits behind the whole stage. **Concentric Circles** draws rings, and you choose how many; **Skew circle sizes** makes the inner rings larger, which can reduce crowding in the centre. **Image** uses a picture of your own.

> Do: Consider customizing the background to orient participants to the activity or to give the layout meaning, for example dividing the canvas into quadrants or social contexts that positions can then be read against.

Read more about [responsive SVG backgrounds](https://documentation.networkcanvas.com/en/design-protocols/responsive-svg-backgrounds).

## Pick the background image

<!-- dialog: choose an image -->

Import an image from your computer, or choose one already stored in this protocol. A responsive SVG keeps its regions and labels readable as the canvas changes between portrait and landscape.

Read more about [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

## Choose how nodes are first arranged

<!-- section: Node layout -->
<!-- scene: sociogram-layout-mode -->
<!-- field: behaviours.automaticLayout -->

**Manual mode** puts the nodes not yet placed in a bucket at the bottom of the screen; the participant drags each one onto the canvas, and can drag one back to the bucket to remove it. **Automatic mode** arranges the nodes when the stage opens by simulating attraction and repulsion; the participant can pause the simulation and move nodes while it is paused.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
