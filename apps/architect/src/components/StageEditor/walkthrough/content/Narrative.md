<!--
  Walkthrough for the "Narrative" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Narrative.md).
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

# Narrative

## What a narrative is

<!-- scene: narrative-intro -->

The Narrative shows the participant's network back to them, for discussion. It replays an arrangement they made earlier, and the interviewer or participant switches between **presets**, each a different view of the same network: which edges are drawn, which nodes are grouped, and which are highlighted. It does not create nodes or collect data.

Its companion, the [Sociogram](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram), is where participants lay out the network this stage shows.

Read the full [Narrative documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/narrative).

## What data it collects

<!-- scene: narrative-data -->

None. Nothing done on this stage is written back to the participant's network: switching presets, moving nodes and drawing on the canvas all leave your exported data exactly as it was.

> Avoid: Relying on the Narrative to collect data. If you need to record an attribute or an edge a participant identifies while talking, gather it on a data-collecting stage such as the [Sociogram](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram) or a name interpreter.

## When to use it

Use this stage to talk through the network with the participant after they have built it, for example to ask about the groups in it or about who provides support.

Because it collects nothing, plan separately for how you will capture the discussion it prompts, for example with screen and audio recording.

## Choose what this stage shows

<!-- section: Node setup -->

Pick the **node type** shown on this canvas, for example _Person_. Nodes of that type appear only once they have a position in the layout attribute of the preset on screen.

Changing the node type later removes the rest of this stage's settings, apart from its name and interviewer notes, since they all describe the type chosen now. Architect asks before it does.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Build the presets

<!-- section: Visualization presets -->

A preset is one view of the network. The participant sees the first preset when the stage opens, and steps through the others in order with the arrows in the preset switcher at the bottom right of the screen. Every stage needs at least one preset. You can add presets once a node type is chosen.

> Do: Give each preset a single focus that maps to one question, and label it accordingly, for example a _Support_ preset that highlights who provides support, or a _Groups_ preset that shows how the network divides into communities.

> Avoid: Crowding a single preset with every group, edge type and attribute at once. A dense view is hard to read and hard to discuss; separate concerns into distinct presets and switch between them.

## Name the preset

<!-- dialog: create preset | edit preset -->
<!-- field: label -->

The **Preset label** names this view in the preset switcher. The participant sees it, so a short, meaningful name helps them follow the conversation as you switch views.

## Choose where positions come from

<!-- dialog: create preset | edit preset -->
<!-- field: layoutVariable -->
<!-- scene: narrative-layout -->

The **Layout attribute** decides where each node is drawn. Only nodes with a value for it appear, so a layout attribute nobody has filled in shows an empty canvas.

> Do: Reuse the layout attribute your participants filled in on an earlier [Sociogram](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram). This replays their own arrangement of the network rather than starting from an empty canvas.

## Group nodes that share a category

<!-- dialog: create preset | edit preset -->
<!-- field: groupVariable -->
<!-- scene: narrative-groups -->

Pick a **Grouping attribute** to draw a shaded outline around the nodes that share each of its values, one color per value. A node with more than one value sits in overlapping outlines. Only categorical attributes can be picked, and none can be created here, so define the attribute before you build the preset.

## Choose which edges are shown

<!-- dialog: create preset | edit preset -->
<!-- field: edges.display -->

Tick the **Edge types** this preset draws; with none ticked, it draws no edges. Each ticked type asks for a label, which the participant reads in the preset switcher's list of what this preset shows. It starts as the edge type's name.

## Choose what can be highlighted

<!-- dialog: create preset | edit preset -->
<!-- field: highlight -->
<!-- scene: narrative-highlight -->

Tick the **Highlight attributes** this preset can highlight: true or false attributes, such as one set by tapping nodes on a sociogram. Nodes whose value is true get a highlight ring. Each ticked attribute needs a label, which the participant reads in the preset switcher, where they choose one attribute to highlight at a time.

## Choose the background

<!-- section: Background -->

The background sits behind the whole stage. **Concentric Circles** draws rings, and you choose how many; **Skew circle sizes** makes the inner rings larger. **Image** uses a picture of your own.

Read more about [responsive SVG backgrounds](https://documentation.networkcanvas.com/en/design-protocols/responsive-svg-backgrounds).

## Pick the background image

<!-- dialog: choose an image -->

Import an image from your computer, or choose one already stored in this protocol. A responsive SVG keeps its regions and labels readable as the canvas changes between portrait and landscape.

Read more about [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

## Arrange nodes automatically

<!-- section: Narrative behaviors -->
<!-- field: behaviours.automaticLayout -->

With **Automatic layout** on, the nodes settle by simulating attraction and repulsion, starting from their saved positions and pulling grouped nodes together. A pause button in the toolbar at the bottom left stops and restarts it. With it off, nodes stay exactly where the layout attribute puts them. New Narrative stages start with **Automatic layout** and **Allow repositioning** switched on.

## Let the canvas be drawn on

<!-- section: Narrative behaviors -->
<!-- field: behaviours.freeDraw -->
<!-- scene: narrative-draw -->

With **Free-draw** on, the pencil in the toolbar at the bottom left lets the interviewer or participant draw on the canvas. Each line fades away after it is drawn, unless the snowflake button freezes it; the reset button clears them all. Drawings are a live aid to discussion and are never saved.

## Let nodes be moved

<!-- section: Narrative behaviors -->
<!-- field: behaviours.allowRepositioning -->

With **Allow repositioning** on, nodes can be dragged around the canvas while you talk. Their new places last only while the stage is on screen: the positions saved in the layout attribute never change.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section appears once a preset groups nodes, draws edges or highlights attributes, or free-draw is on. It holds the headings of the preset switcher's lists (**Attributes**, **Links** and **Groups**), and, while free-draw is on, the names of the drawing buttons.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
