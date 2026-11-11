<!--
  Walkthrough for the "Network Composer" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, scene:, dialog:, include:) say where a step
  points.
-->

# Network Composer

## What a network composer is

<!-- scene: network-composer-intro -->

The Network Composer builds a whole network on one canvas. Instead of moving through separate stages to name alters, ask about them and draw the edges between them, you do all of it in one place. You can create alters, record their attributes, draw relationships of several types, and reposition everything as the picture develops.

The Network Composer is dense and fast to use. It is meant for a researcher or interviewer, working with or without a participant, to sketch, pilot or model a network.

Read the full [Network Composer documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/network-composer).

## What data it collects

<!-- scene: network-composer-data -->

This stage collects alters, the edges between them, and attributes about both. Everything made on this stage is saved to the participant's network:

- **Nodes** of the stage's node type. Each node has the name typed when it was added, its position on the canvas, the groups it belongs to, and the answers to its attribute form.
- **Edges** of each type you allow. Each edge has the answers to its type's attribute form. In your exported data, each edge is one row in the edge list.

## When to use it

Use this stage when you want to build and edit a whole network from a single screen, rather than leading the participant through one task at a time.

> Do: Use the Network Composer when an interviewer works through a participant's network in conversation, or when a researcher sketches a network while piloting a study.

> Avoid: Handing the Network Composer to an unassisted participant. It is a dense tool intended for researcher- or interviewer-led use, not a guided, step-by-step participant task.

## The tools on the canvas

<!-- scene: network-composer-tools -->

A palette of tools runs down the left of the canvas. A tool stays active until the interviewer picks another one.

**Draw edge** and **Groups** appear only once you have set them up later in this editor, and the other tools are always there. The numbers below match the illustration:

1. **Select and move**: drag an alter to move it. Tap an alter or an edge to open its form in a panel on the right. Tap an empty part of the canvas to clear the selection.
2. **Add node**: opens the name box. Type a name and press Enter to add an alter.
3. **Draw edge**: pick an edge type, then tap two alters to connect them.
4. **Groups**: pick a group, then tap an alter to add it to the group or take it out.
5. **Automatic layout**: switches the automatic layout on or off.
6. **Undo**: reverses the last change, such as adding an edge, changing a group or moving an alter. The usual keyboard shortcut also works.
7. **Redo**: replays what was undone. The usual keyboard shortcut also works.

## Choose what this stage builds

<!-- section: Node setup -->

Choose what kind of node this canvas creates, such as _Person_. Every node of that type already in the participant's network, such as alters named on an earlier stage, also appears on the canvas. The interviewer can move, connect and group those nodes too.

Changing the node type later clears this stage's other settings, because they depend on the node type. Only the stage's name and interviewer notes are kept. Architect asks you to confirm first.

<!-- include: node-type -->

## Choose where typed names are saved

<!-- section: Node configuration -->
<!-- field: quickAdd -->
<!-- scene: network-composer-add -->

The **Add node** tool opens the name box beside the palette. When the interviewer types a name and presses Enter, a node is added with that name saved in the **quick add attribute**. The quick add attribute is usually a name or label. The name box stays open, so the interviewer can add several alters in a row.

With automatic layout off, each new node is placed on the next free spot of a grid, starting from the top left. With automatic layout on, the layout positions the new node.

Pick a text attribute, or type a new name in the picker to create one. No window opens for a new attribute, and an attribute created here starts out required, so a node can't be added with an empty name.

## Choose where positions are saved

<!-- section: Node configuration -->
<!-- field: layoutVariable -->
<!-- scene: network-composer-positions -->

The **layout attribute** stores where each node sits on the canvas, as a pair of coordinates from 0 to 1. It updates every time a node is moved. Reusing the same layout attribute on a later [Sociogram](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram) or [Narrative](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/narrative) stage carries the arrangement over.

> Avoid: Treating where alters sit as if it were measured data. On-screen position is soft and is interpreted differently by different people. If ring or zone membership matters to your analysis, capture it as an explicit attribute instead of inferring it from coordinates.

## Choose how the canvas starts

<!-- section: Node configuration -->
<!-- field: behaviours.automaticLayout -->
<!-- scene: network-composer-auto-layout -->

With automatic layout on, the nodes spread out by simulating attraction and repulsion, and members of the same group are pulled together. With automatic layout off, nodes stay exactly where the interviewer puts them.

Unlike on the Sociogram, automatic layout is not fixed when you design the stage. The interviewer can switch it on or off at any time with the **Automatic layout** tool. **Start with automatic layout switched on** only decides how the stage opens, and if the interviewer changes it during the interview, the stage remembers their choice.

## Group alters

<!-- section: Node configuration -->
<!-- field: convexHullVariable -->
<!-- scene: network-composer-groups -->

Pick a **categorical attribute** to group by, such as _household_ or _friendship group_. Each of its options becomes a group, drawn as a shaded outline behind its members in its own color. Once the attribute is set, the shaded outlines are always shown.

The **Groups** tool lists the groups with their colors. The interviewer picks a group and taps alters to add them to the group or take them out. While a group is in use, the Groups button takes on that group's color. An alter can belong to more than one group. In your data, the attribute becomes one true or false column for each group.

Grouping is optional. Without a grouping attribute, the Groups tool is not shown.

## Group several alters at once

<!-- section: Node configuration -->
<!-- field: convexHullVariable -->
<!-- scene: network-composer-lasso -->

Once the stage has a grouping attribute, the interviewer can also select several alters at once with the select tool, either by drawing a freehand lasso around them or by shift-clicking each one. A row of group buttons then rises from the bottom of the canvas, and one tap on a group button adds the whole selection to that group. The interviewer can also delete the whole selection at once.

## Name the groups

<!-- dialog: create a new grouping attribute -->

Give the attribute a name, then use **Create new option** under **Choice values** to add one option for each group. Each option's label is what the interviewer sees in the Groups tool and on the group buttons, and its value is what is saved in your data.

Read more about [variables and attributes](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/variables).

## Ask about each node

<!-- section: Editable attributes -->
<!-- field: nodeForm.fields -->
<!-- scene: network-composer-inspector -->

Switch on **Editable attributes** to give nodes a form. When the interviewer selects a node, a panel opens from the right edge of the screen, titled with the node's name. It holds these fields and a button to delete the node. Answers are saved as they are given, and can be undone like any other change.

Drag the fields to set their order. If there are no fields, the panel says there are no attributes to edit.

## Choose what this field records

<!-- dialog: form field -->
<!-- field: variable -->

Each field saves its answer to an **attribute**. Use **Select attribute** to find one, or type a new name there to create it. Only attributes a form can collect are listed. Position and map location attributes are left out, because they are set by moving things on screen rather than by answering a question. An attribute can appear only once on a form.

## Choose the input control

<!-- dialog: form field -->
<!-- field: component -->
<!-- scene: form-field-input-controls -->

The **input control** decides what the interviewer uses to answer, such as a text box, a set of options, a toggle or a slider.

Unlike on other forms, the input control is chosen here, on the stage, rather than on the attribute. This means the same attribute can be collected with a different input control on another stage. For a new attribute, the input control you pick also decides what kind of answer the attribute holds.

Read more about [input controls](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls).

## Set what the field accepts

<!-- dialog: form field -->
<!-- field: parameters -->

Some input controls have settings, such as the two ends of a scale or the window a date must fall in. These settings start with the attribute's own values. A change you make applies only to this field, and the attribute and other stages stay as they were.

## Write the question

<!-- dialog: form field -->
<!-- field: label -->

Every field needs a **question**. The question starts as the attribute's name, so change it to the words you want shown, such as _"How close are you?"_. The question can be translated.

## Add help text

<!-- dialog: form field -->
<!-- field: hint -->

**Help text** appears under the question. Use it for an example or a short explanation, rather than making the question longer.

## Show the rules

<!-- dialog: form field -->
<!-- field: showValidationHints -->
<!-- scene: form-field-validation -->

The validation rules come from the attribute, such as being required or having a minimum length. Switch on **Show validation hints** to show the interviewer what a valid answer looks like before they answer.

Read more about [validation](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/field-validation).

## Try the field

<!-- dialog: form field -->

The **Interactive preview**, on the other half of this window, shows the field as it will appear in the interview. Answer the field there, and use **Check response** to test the validation rules.

## Choose the edges that can be drawn

<!-- section: Edge configuration -->
<!-- scene: network-composer-edges -->

Add a **connection type** for each kind of relationship the interviewer can draw, such as _Friends_ or _Family_. Each connection type uses one edge type from the codebook.

The **Draw edge** tool opens a menu of these connection types. After the interviewer picks one, the Draw edge button takes on that type's color, and tapping one alter and then another connects them. Tapping the same pair again removes the edge. Tapping the first alter twice cancels an edge that is only half drawn.

Each edge type can be added only once. The Draw edge tool appears when the stage has at least one connection type.

> Do: Prompt explicitly for alters who have no edges. A clustering, on-screen picture can shape what people report and tends to draw attention away from unconnected alters, so isolated members of the network are easily overlooked.

## Pick the edge type

<!-- dialog: add a connection type | edit connection type -->
<!-- field: subject -->

Pick an **edge type** from the codebook, or create a new one. Edges of this type are drawn on the canvas in the edge type's color.

If you change the edge type of an existing connection type, Architect removes the fields of its attribute form, because those fields record attributes of the old edge type.

## Label the connection type

<!-- dialog: add a connection type | edit connection type -->
<!-- field: label -->

The **label** is the name of this connection type in the Draw edge menu, and the title of its attribute form. If you leave the label empty, the edge type's name is used. The label can be translated.

<!-- include: edge-type -->

## Ask about each edge

<!-- section: Edge configuration -->
<!-- scene: network-composer-edge-inspector -->

Each connection type gets its own list of **editable attributes**, below the list of connection types. When the interviewer selects an edge on the canvas, the same panel opens as for a node, titled with the connection type's label and holding its fields. You set up these fields in the same window as node fields.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section holds the wording Network Canvas supplies for the canvas, including the name box placeholder, the tooltips of the add node, automatic layout and draw edge tools, and the heading of the groups list. Every Network Composer stage shows the same wording, so a change here applies to all Network Composer stages in the protocol. A change is saved as soon as you leave the field.

**Connection label** is the panel title for an edge whose type this stage does not draw, such as an edge drawn on an earlier stage.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

## Choose the background

<!-- section: Background -->
<!-- scene: sociogram-background -->

The background sits behind the whole canvas. **Concentric Circles** draws rings, and you choose how many. **Skew circle sizes** makes the inner rings larger. **Image** uses a picture of your own.

> Do: Customize the background to orient placement, for example using rings to suggest closeness. Position is stored as raw coordinates, so treat any spatial meaning as a cue for discussion rather than a measurement.

Read more about [responsive SVG backgrounds](https://documentation.networkcanvas.com/en/design-protocols/responsive-svg-backgrounds).

## Pick the background image

<!-- dialog: choose an image -->

Import an image from your computer, or choose one already stored in this protocol. A responsive SVG keeps its regions and labels readable as the canvas changes between portrait and landscape.

Read more about [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
