<!--
  Walkthrough for the "Network Composer" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, scene:, dialog:, include:) say where a step
  points.
-->

# Network Composer

## What a network composer is

<!-- scene: network-composer-intro -->

The Network Composer builds a whole network on one canvas. Instead of moving through separate stages to name alters, ask about them and draw the edges between them, the Network Composer brings these together in a single canvas, so you can create alters, record their attributes, draw relationships of several types, and reposition everything as the picture develops.

It is a dense, fast tool, designed to be driven by a researcher or interviewer, either alongside a participant or alone, to sketch, pilot or model a network.

Read the full [Network Composer documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/network-composer).

## What data it collects

<!-- scene: network-composer-data -->

Everything made on this stage is saved to the participant's network:

- **Nodes** of the stage's node type, each with the name typed to add it, its position on the canvas, the groups it belongs to, and the answers to its attribute form.
- **Edges** of each type you allow, with the answers to that type's attribute form. Every edge becomes one row in the edge list.

## When to use it

Use this stage when you want to build and edit a whole network from a single screen, rather than leading the participant through one task at a time.

> Do: Use the Network Composer when an interviewer works through a participant's network in conversation, or when a researcher sketches a network while piloting a study.

> Avoid: Handing the Network Composer to an unassisted participant. It is a dense tool intended for researcher- or interviewer-led use, not a guided, step-by-step participant task.

## The tools on the canvas

<!-- scene: network-composer-tools -->

A palette of tools floats down the left of the canvas. A tool stays active until another is picked.

**Select and move**, **Add node**, **Automatic layout**, **Undo** and **Redo** are always on the palette. The other two only appear once you set them up later in this editor:

- **Draw edge** appears once you add an edge type.
- **Groups** appears once you choose a grouping attribute.

The next steps go through each tool, showing what it does on the canvas.

## Select and move

<!-- scene: network-composer-tool-select -->

Drag an alter to move it; its new place is saved to the layout attribute. Tap an alter or an edge to select it and open its attribute form in a panel on the right. Tap an empty part of the canvas to clear the selection.

## Add node

<!-- scene: network-composer-tool-add -->

Opens the name field beside the palette. Type a name and press Enter to add an alter. Once added, it is placed on the next free spot of a grid (or arranged by the automatic layout, when that is on). The box stays open, so several can be added in a row.

## Draw edge

<!-- scene: network-composer-tool-edge -->

Opens a menu of this stage's edge types. Pick one, and the button takes on that type's color while it is in use. Then tap one alter and then another to connect them. Tapping the same pair again removes the edge.

## Groups

<!-- scene: network-composer-tool-groups -->

Shades the alters that share a value of a single categorical variable, chosen in Architect, as colored convex hulls behind them, making clusters such as "household" or "friendship group" easy to see. The hulls are always visible once the variable is configured, and the automatic layout gently pulls members of the same group together. The tool lists the groups alongside their colors. Pick one, and the button takes on that color while it is in use. Then tap alters to add them to the group, and tap one again to take it out.

## Automatic layout

<!-- scene: network-composer-tool-layout -->

Switches the force-directed arrangement on and off. While it is on, alters spread out and members of the same group are pulled together. Switched off, they stay where they are.

## Undo and redo

<!-- scene: network-composer-tool-undo -->

**Undo** reverses the last change: adding or removing alters and edges, editing attributes, group membership and moving alters. **Redo** replays what was undone. Both also work with the usual keyboard shortcuts.

## Choose what this stage builds

<!-- section: Node setup -->

Pick the **node type** this canvas creates, for example _Person_. Every node of that type already in the participant's network, such as alters named on an earlier stage, appears on the canvas too, ready to be moved, connected and grouped.

Changing the node type later removes the rest of this stage's settings, apart from its name and interviewer notes, since they all describe the type chosen now. Architect asks before it does.

<!-- include: node-type -->

## Choose what the name box fills in

<!-- section: Node configuration -->
<!-- field: quickAdd -->
<!-- scene: network-composer-add -->

The **Add node** tool opens a box beside the palette. Typing a name and pressing Enter adds a node with that name saved in the **quick add attribute**, usually a name or label. The box stays open, so several alters can be added in a row.

With automatic layout off, each new node lands on the next free spot of a grid from the top left. With it on, the layout places it.

Pick a text attribute, or type a new name in the picker to create one; no window opens. A new attribute made here starts out required, so a node cannot be added with an empty name.

## Choose where positions are saved

<!-- section: Node configuration -->
<!-- field: layoutVariable -->
<!-- scene: network-composer-positions -->

The **layout attribute** stores where each node sits on the canvas, as a pair of coordinates from 0 to 1. It updates every time a node is moved. Reusing the same layout attribute on a later [Sociogram](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram) or [Narrative](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/narrative) carries the arrangement over.

> Avoid: Treating where alters sit as if it were measured data. On-screen position is soft and is interpreted differently by different people. If ring or zone membership matters to your analysis, capture it as an explicit attribute instead of inferring it from coordinates.

## Choose how the canvas starts

<!-- section: Node configuration -->
<!-- field: behaviours.automaticLayout -->
<!-- scene: network-composer-auto-layout -->

With automatic layout on, the nodes spread out by simulating attraction and repulsion, and members of the same group are pulled together. With it off, nodes stay exactly where they are put.

Unlike the Sociogram, this is not fixed at design time: the interviewer can switch it on or off at any point with the **Automatic layout** tool. **Start with automatic layout switched on** only chooses how the stage opens, and whichever way it is switched during the interview is remembered for the stage.

## Group alters

<!-- section: Node configuration -->
<!-- field: convexHullVariable -->
<!-- scene: network-composer-groups -->

Pick a **categorical attribute** to group by, such as _household_ or _friendship group_. Each of its options becomes a group, drawn as a shaded outline behind its members, one color per group.

With the **Groups** tool, the interviewer picks a group and taps alters to add or remove them. An alter can belong to more than one group. In your data, the attribute becomes one true or false column for each group.

Grouping is optional. Without a grouping attribute the Groups tool is not shown.

## Group several alters at once

<!-- section: Node configuration -->
<!-- field: convexHullVariable -->
<!-- scene: network-composer-lasso -->

Once the stage has a grouping attribute, the select tool can also draw a freehand lasso around several alters, or the interviewer can shift-click them. A row of group buttons then rises from the bottom of the canvas: one tap adds the whole selection to a group. The same selection can be deleted together.

## Name the groups

<!-- dialog: create a new grouping attribute -->

Give the attribute a name, then use **Create new option** under **Choice values** to add one option for each group. Each option's label is what the interviewer sees in the Groups tool and on the group buttons; its value is what is saved in your data.

Read more about [variables and attributes](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/variables).

## Ask about each node

<!-- section: Editable attributes -->
<!-- field: nodeForm.fields -->
<!-- scene: network-composer-inspector -->

Switch on **Editable attributes** to give nodes a form. Selecting a node opens a panel from the right edge of the screen, titled with its name, holding these fields and a button to delete the node. Answers are saved as they are given, and can be undone like any other change.

Drag the fields to set their order. Without any fields, the panel says there are no attributes to edit.

## Choose what this field records

<!-- dialog: form field -->
<!-- field: variable -->

Each field saves its answer to an **attribute**. Use **Select attribute** to find one, or type a new name there to create it. Only attributes a form can collect are listed: positions and map locations are set by moving things, not by answering. An attribute can appear only once on a form.

## Choose how they answer

<!-- dialog: form field -->
<!-- field: component -->
<!-- scene: form-field-input-controls -->

The **input control** decides what the interviewer uses to answer: a text box, a set of options, a toggle, a slider and so on.

Unlike other forms, the control is chosen here, on the stage, rather than on the attribute, so the same attribute can be collected with a different control on another stage. For a new attribute, the control you pick also decides what kind of answer it holds.

Read more about [input controls](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls).

## Set what the field accepts

<!-- dialog: form field -->
<!-- field: parameters -->

Once an input control is chosen, some take settings, such as the two ends of a scale or the window a date must fall in. They start as the attribute's own; change any of them and this field keeps its own set, leaving the attribute and other stages as they were.

## Write the question

<!-- dialog: form field -->
<!-- field: label -->

Every field needs a **question**. It starts as the attribute's name, so change it to the words that should be read, such as _"How close are you?"_. The question can be translated.

## Add help text

<!-- dialog: form field -->
<!-- field: hint -->

**Help text** appears under the question. Use it for an example or a short explanation, rather than making the question longer.

## Show the rules

<!-- dialog: form field -->
<!-- field: showValidationHints -->
<!-- scene: form-field-validation -->

The validation rules come from the attribute, such as being required or a minimum length. Switch on **Show validation hints** to say what a valid answer looks like before one is given.

Read more about [validation](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/field-validation).

## Try the field

<!-- dialog: form field -->

The **Interactive preview**, the other half of this window, shows the field as it will be answered. Answer it there, and use **Check response** to test the validation rules.

## Choose the edges that can be drawn

<!-- section: Edge configuration -->
<!-- scene: network-composer-edges -->

Add a **connection type** for each kind of relationship the interviewer can draw, such as _Friends_ or _Family_. The **Draw edge** tool opens a menu of these; after picking one, tapping one alter and then another connects them. Tapping the same pair again removes the edge, and tapping the first alter twice cancels a half-drawn one.

Each type can be added once, and the Draw edge tool appears only once there is at least one.

> Do: Prompt explicitly for alters who have no edges. A clustering, on-screen picture can shape what people report and tends to draw attention away from unconnected alters, so isolated members of the network are easily overlooked.

## Pick the edge type

<!-- dialog: add a connection type | edit connection type -->
<!-- field: subject -->

Pick an **edge type** from the codebook, or create a new one. Its color is how the edges are drawn on the canvas.

Changing the type of an existing connection type removes the fields of its attribute form, because they record attributes of the old edge type.

## Label it

<!-- dialog: add a connection type | edit connection type -->
<!-- field: label -->

The **label** is how this edge type is chosen in the Draw edge menu, and the title of its attribute form. Left empty, it is the edge type's name. It can be translated.

<!-- include: edge-type -->

## Ask about each edge

<!-- section: Edge configuration -->
<!-- scene: network-composer-edge-inspector -->

Each connection type gets its own list of **editable attributes**, below the list of types. Selecting an edge on the canvas opens the same panel as for a node, titled with the type's label and holding its fields. Its fields are set up in the same window as a node's.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section holds the words Network Canvas supplies for the canvas, such as the name box placeholder, the tooltips of the add node, automatic layout and draw edge tools, and the heading of the groups list. Every Network Composer stage shows the same words, so a change here applies to every Network Composer stage in the protocol, and is saved as soon as you leave the field.

**Connection label** titles the panel of an edge whose type this stage does not draw, such as one drawn on an earlier stage.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

## Choose the background

<!-- section: Background -->
<!-- scene: sociogram-background -->

The background sits behind the whole canvas. **Concentric Circles** draws rings, and you choose how many; **Skew circle sizes** makes the inner rings larger. **Image** uses a picture of your own.

> Do: Customize the background to orient placement, for example using rings to suggest closeness. Position is stored as raw coordinates, so treat any spatial meaning as a cue for discussion rather than a measurement.

Read more about [responsive SVG backgrounds](https://documentation.networkcanvas.com/en/design-protocols/responsive-svg-backgrounds).

## Pick the background image

<!-- dialog: choose an image -->

Import an image from your computer, or choose one already stored in this protocol. A responsive SVG keeps its regions and labels readable as the canvas changes between portrait and landscape.

Read more about [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
