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

On the Sociogram, participants work with the alters they have already named. They position the alters on a canvas, draw edges between them, and tap an alter to highlight it. Each edge is saved as one of the stage's edge types, and highlighting an alter sets a true/false attribute to true for it. The Sociogram does not create new nodes.

Its companion, the [Narrative](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/narrative) Interface, displays a network the participant has already laid out so that it can be discussed. It collects no new data.

Read the full [Sociogram documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram).

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

<!-- section: Node setup -->

Choose the **node type** this stage places on the canvas, such as _Person_. Every node of that type that is already in the participant's network appears on this stage.

Changing the node type later clears this stage's other settings, because they depend on the node type. Only the stage's name and interviewer notes are kept. Architect asks you to confirm first.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Write the prompts

<!-- section: Prompt collection -->

Each prompt sets one task on the canvas, such as placing nodes, drawing one kind of edge, or marking nodes with a characteristic. The participant works through the prompts one at a time, in the order you set, on the same canvas.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the instruction shown in the prompt card over the canvas, such as _"Place the people who know each other close together."_ or _"Drag the places you visit every week into the inner circle."_ The participant can drag the card out of the way.

> Do: Match each prompt's wording to its tap behavior: ask about relationships on edge-creation prompts, and about a characteristic of individual alters on attribute-toggling prompts.

## Choose where positions are saved

<!-- dialog: create prompt | edit prompt -->
<!-- scene: sociogram-shared-layout -->
<!-- field: layout.layoutVariable -->

The **Layout attribute** stores where each node is placed while this prompt is on screen. Prompts that use the same layout attribute share one arrangement, so positions carry over from one prompt to the next, while a prompt with a different layout attribute starts a separate arrangement.

To create a new layout attribute, type its name in the picker. A layout attribute needs only a name, so no window opens.

> Do: Keep the same layout attribute across a stage's prompts when you want participants to build up one arrangement of their network, so the positions they set on an early prompt are still there on later ones.

Read more about [variables](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/variables).

## Order the nodes waiting to be placed

<!-- dialog: create prompt | edit prompt -->

In manual mode, nodes that have not been placed yet wait in a bucket at the bottom of the screen. Switch on **Sort unplaced nodes** to order the bucket by one or more attributes. Without sort rules, the nodes appear in the order they were added.

## Choose what tapping does

<!-- dialog: create prompt | edit prompt -->
<!-- scene: sociogram-tap -->

Switch on **Node interaction** to make tapping a node do something:

- **Edge creation**: the participant taps one node and then another to draw an edge of the chosen type between them. Tapping the same two nodes again removes the edge.
- **Attribute toggling**: tapping a node switches a true/false attribute between true and false, and nodes whose value is true are highlighted.

For attribute toggling, pick a **Boolean attribute**, or type a new name in the picker to create one.

A prompt uses at most one of these, and neither while the section is switched off. Each edge-creation prompt creates one edge type, so ask about each kind of relationship on its own prompt.

## Choose which edges are shown

<!-- dialog: create prompt | edit prompt -->
<!-- scene: sociogram-display-edges -->
<!-- field: edges.display -->

**Displayed edges** sets which edge types are drawn while this prompt is on screen. You can use it, for example, to show the edges drawn on an earlier prompt. When you choose an edge type for edge creation, Architect also ticks that edge type here so that participants see the edges they draw. Edges between the same two nodes are drawn on top of each other, so only one of them can be seen.

<!-- include: edge-type -->

## Choose the background

<!-- section: Background -->
<!-- scene: sociogram-background -->

The background sits behind the whole stage. **Concentric Circles** draws a number of rings that you choose, and **Skew circle sizes** makes the inner rings larger, which can reduce crowding in the center. **Image** uses a picture of your own instead.

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

In **Manual mode**, nodes that have not been placed yet wait in a bucket at the bottom of the screen. The participant drags each node onto the canvas, and can drag a node back to the bucket to remove it from the canvas.

In **Automatic mode**, Network Canvas arranges the nodes for the participant when the stage opens by simulating attraction and repulsion. The participant can pause the simulation and move nodes while it is paused.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
