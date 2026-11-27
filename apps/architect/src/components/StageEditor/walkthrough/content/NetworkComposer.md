<!--
  Walkthrough for the "Network Composer" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, control:, scene:, include:) say where a step
  points.
-->

# Network Composer

## What is the Network Composer?

<!-- scene: network-composer-intro -->

The Network Composer is unlike other interfaces in Network Canvas, because it is designed to be used by the interviewer and not the participant. It works like a "notepad", and is intended to be used to quickly create nodes, edges, and groups in response to an open-ended conversation or discussion. It can form part of a narrative-driven, semi-structured, or qualitative interview.

Read the full [Network Composer documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/network-composer).

## When to use it

Use this stage when you want to build and edit a whole network from a single screen, rather than leading the participant through one task at a time.

> Do: Use the Network Composer when an interviewer works through a participant's network in conversation, or when a researcher sketches a network while discussing it with the participant.

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

## Choose the quick add attribute

<!-- section: composer-nodes -->
<!-- field: quickAdd -->
<!-- scene: network-composer-add -->

The **Add node** tool opens the name box beside the palette. When the interviewer types a name and presses Enter, a node is added with that name saved to the **quick add attribute** specified here.

Pick an existing text attribute, or type a new name in the picker to create a new one.

## Choose the layout

<!-- section: composer-nodes -->
<!-- field: layout -->
<!-- scene: network-composer-positions -->

The **layout** stores where each node sits on the canvas, as a pair of coordinates. It updates every time a node is moved. Choosing the same layout on a later [Sociogram](https://documentation.networkcanvas.com/design-protocols/interface-documentation/sociogram) or [Narrative](https://documentation.networkcanvas.com/design-protocols/interface-documentation/narrative) stage carries the arrangement over.

> Avoid: Treating where alters sit as if it were measured data. On-screen position is soft and is interpreted differently by different people. If ring or zone membership matters to your analysis, capture it as an explicit attribute instead of inferring it from coordinates.

## Choose how the layout behaves

<!-- section: composer-nodes -->
<!-- field: behaviours.automaticLayout -->
<!-- scene: network-composer-auto-layout -->

With automatic layout on, nodes are spread out by simulating attraction and repulsion, and members of the same group are pulled together. With automatic layout off, nodes stay exactly where the interviewer puts them.

Unlike on the Sociogram, automatic layout is not fixed when you configure the stage. The interviewer can switch it on or off at any time with the **Automatic layout** tool. **Start with automatic layout switched on** only decides how the stage opens, and if the interviewer changes it during the interview, the stage remembers their choice.

## Group alters

<!-- section: composer-nodes -->
<!-- field: convexHullVariable -->
<!-- scene: network-composer-groups -->

Pick a **categorical attribute** to group by, such as _household_ or _friendship group_. Each option within this attribute becomes a group, and nodes that share a group have a **convex hull** drawn around them.

Grouping is optional. Without a grouping attribute, the Groups tool is not shown.

## Ask about each node

<!-- section: composer-node-form -->
<!-- field: nodeForm.fields -->
<!-- scene: network-composer-inspector -->

Switch on **Editable attributes** to make it so that selecting a node reveals a form containing any number of attributes that can be set on this screen. Answers are saved as they are given, and can be undone like any other change.

Drag the fields to set their order. If there are no fields, the panel says there are no attributes to edit.

## Choose the edges that can be drawn

<!-- section: composer-connections -->
<!-- scene: network-composer-edges -->

Add a **connection type** for each kind of relationship the interviewer can draw, such as _Friends_ or _Family_.

The **Draw edge** tool opens a menu of these connection types. After the interviewer picks one, the Draw edge button takes on that type's color, and tapping one alter and then another connects them. Tapping the same pair again removes the edge. Tapping the first alter twice cancels an edge that is only half drawn.

> Do: Prompt explicitly for alters who have no edges. A clustering, on-screen picture can shape what people report and tends to draw attention away from unconnected alters, so isolated members of the network are easily overlooked.

## Edge attributes

<!-- section: composer-connections -->
<!-- scene: network-composer-edge-inspector -->

In the same way as arbitrary node attributes can be collected, this interface supports assigning edge attributes. Each connection type gets its own list of **editable attributes**, below the list of connection types. When the interviewer selects an edge on the canvas, the same panel opens as for a node, titled with the connection type's label and holding its fields. You set up these fields in the same window as node fields.

<!-- include: built-in-wording -->

<!-- include: background -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
