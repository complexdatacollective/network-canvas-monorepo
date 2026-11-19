<!--
  Walkthrough for the "Network Composer" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, control:, scene:, include:) say where a step
  points.
-->

# Network Composer

## What a network composer is

<!-- scene: network-composer-intro -->

The Network Composer builds a whole network on one canvas. Instead of moving through separate stages to name alters, ask about them and draw the edges between them, you do all of it in one place. You can create alters, record their attributes, draw relationships of several types, and reposition everything as the picture develops.

The Network Composer is dense and fast to use. It is meant for a researcher or interviewer, working with or without a participant, to sketch, pilot or model a network.

Read the full [Network Composer documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/network-composer).

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

<!-- include: node-type -->

## Choose where typed names are saved

<!-- section: composer-nodes -->
<!-- field: quickAdd -->
<!-- scene: network-composer-add -->

The **Add node** tool opens the name box beside the palette. When the interviewer types a name and presses Enter, a node is added with that name saved in the **quick add attribute**. The quick add attribute is usually a name or label. The name box stays open, so the interviewer can add several alters in a row.

With automatic layout off, each new node is placed on the next free spot of a grid, starting from the top left. With automatic layout on, the layout positions the new node.

Pick a text attribute, or type a new name in the picker to create one. No window opens for a new attribute, and an attribute created here starts out required, so a node can't be added with an empty name.

## Choose where positions are saved

<!-- section: composer-nodes -->
<!-- field: layoutVariable -->
<!-- scene: network-composer-positions -->

The **layout attribute** stores where each node sits on the canvas, as a pair of coordinates from 0 to 1. It updates every time a node is moved. Reusing the same layout attribute on a later [Sociogram](https://documentation.networkcanvas.com/design-protocols/interface-documentation/sociogram) or [Narrative](https://documentation.networkcanvas.com/design-protocols/interface-documentation/narrative) stage carries the arrangement over.

> Avoid: Treating where alters sit as if it were measured data. On-screen position is soft and is interpreted differently by different people. If ring or zone membership matters to your analysis, capture it as an explicit attribute instead of inferring it from coordinates.

## Choose how the canvas starts

<!-- section: composer-nodes -->
<!-- field: behaviours.automaticLayout -->
<!-- scene: network-composer-auto-layout -->

With automatic layout on, the nodes spread out by simulating attraction and repulsion, and members of the same group are pulled together. With automatic layout off, nodes stay exactly where the interviewer puts them.

Unlike on the Sociogram, automatic layout is not fixed when you design the stage. The interviewer can switch it on or off at any time with the **Automatic layout** tool. **Start with automatic layout switched on** only decides how the stage opens, and if the interviewer changes it during the interview, the stage remembers their choice.

## Group alters

<!-- section: composer-nodes -->
<!-- field: convexHullVariable -->
<!-- scene: network-composer-groups -->

Pick a **categorical attribute** to group by, such as _household_ or _friendship group_. Each of its options becomes a group, drawn as a shaded outline behind its members in its own color. Once the attribute is set, the shaded outlines are always shown.

The **Groups** tool lists the groups with their colors. The interviewer picks a group and taps alters to add them to the group or take them out. While a group is in use, the Groups button takes on that group's color. An alter can belong to more than one group. In your data, the attribute becomes one true or false column for each group.

Grouping is optional. Without a grouping attribute, the Groups tool is not shown.

## Group several alters at once

<!-- section: composer-nodes -->
<!-- field: convexHullVariable -->
<!-- scene: network-composer-lasso -->

Once the stage has a grouping attribute, the interviewer can also select several alters at once with the select tool, either by drawing a freehand lasso around them or by shift-clicking each one. A row of group buttons then rises from the bottom of the canvas, and one tap on a group button adds the whole selection to that group. The interviewer can also delete the whole selection at once.

## Ask about each node

<!-- section: composer-node-form -->
<!-- field: nodeForm.fields -->
<!-- scene: network-composer-inspector -->

Switch on **Editable attributes** to give nodes a form. When the interviewer selects a node, a panel opens from the right edge of the screen, titled with the node's name. It holds these fields and a button to delete the node. Answers are saved as they are given, and can be undone like any other change.

Drag the fields to set their order. If there are no fields, the panel says there are no attributes to edit.

A field's question starts as the attribute's name, so change it to the words you want shown. Unlike on other forms, the input control is chosen on this stage rather than on the attribute, and for a new attribute it also decides what kind of answer the attribute holds.

## Choose the edges that can be drawn

<!-- section: composer-connections -->
<!-- scene: network-composer-edges -->

Add a **connection type** for each kind of relationship the interviewer can draw, such as _Friends_ or _Family_. Each connection type uses one edge type from the codebook.

The **Draw edge** tool opens a menu of these connection types. After the interviewer picks one, the Draw edge button takes on that type's color, and tapping one alter and then another connects them. Tapping the same pair again removes the edge. Tapping the first alter twice cancels an edge that is only half drawn.

Each edge type can be added only once. The Draw edge tool appears when the stage has at least one connection type. Changing a connection type's edge type later removes the fields of its attribute form.

> Do: Prompt explicitly for alters who have no edges. A clustering, on-screen picture can shape what people report and tends to draw attention away from unconnected alters, so isolated members of the network are easily overlooked.

## Ask about each edge

<!-- section: composer-connections -->
<!-- scene: network-composer-edge-inspector -->

Each connection type gets its own list of **editable attributes**, below the list of connection types. When the interviewer selects an edge on the canvas, the same panel opens as for a node, titled with the connection type's label and holding its fields. You set up these fields in the same window as node fields.

<!-- include: built-in-wording -->

<!-- include: background -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
