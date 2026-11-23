---
title: Narrative
navOrder: 10
---

<InterfaceSummary type="Narrative">

<InterfaceMeta type="Data Visualization" creates="Does not create data" usesprompts="false">

</InterfaceMeta>

</InterfaceSummary>

The Narrative and the [Sociogram](/en/design-protocols/interface-documentation/sociogram) are Network Canvas's two canvas-based visualization interfaces. On the Sociogram, participants build the spatial picture of their network by positioning alters and drawing the ties between them. The Narrative is its display-only companion: it takes a network that the participant has already laid out — commonly on a Sociogram — and represents it back to them for open, researcher-led discussion. It records no new data of its own.

Because it collects nothing, the Narrative is built for qualitative work. It maps data gathered elsewhere in the interview onto the visual network — group memberships, attributes, and edge types — so that the participant and researcher can talk through the picture together and interrogate what it shows.

## Presets

Everything that you configure on the Narrative lives in one or more **presets**. A preset is a saved view of the network that combines up to four ingredients:

| Ingredient                | What it does                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layout** (required)     | A layout variable that positions the nodes. Only alters that already have a value for this variable appear, so choose one that an earlier stage populated — for example the layout variable that a Sociogram prompt wrote. |
| **Groups** (optional)     | A categorical variable drawn as semi-transparent, colored convex hulls behind the nodes that share each value. A node with several values appears inside several overlapping hulls.                                        |
| **Links** (optional)      | One or more edge types to draw between the nodes.                                                                                                                                                                          |
| **Attributes** (optional) | One or more boolean variables. Nodes whose value is true are highlighted while the preset is active.                                                                                                                       |

Each preset has a label that identifies it in the interface. During the interview, a floating preset switcher lets the researcher or participant step between presets and toggle the groups, links, and highlighted attributes on and off. Where a preset lists several highlight attributes, they choose which one to show at a time, from a list that shows the label that you gave each attribute. The edge types that a preset draws are listed by the labels that you gave them too. Nothing done here is written back to the data — the Narrative only ever reads.

<AppOnly app="current">

A preset can also have a **filter**: rules that choose which part of the network that preset shows. Each preset has its own filter, so one stage can show the whole network in one preset and only part of it in another — everyone in the first view, for example, and only family members in the second.

</AppOnly>

![An example Narrative preset, with highlighted nodes, edges between them, and colored group hulls](/assets/img/interface-documentation/narrative/narrative-example.png)

## Configuring presets in Architect

A Narrative needs at least one preset. For each preset you set:

- **Preset label** — a short, participant-visible name shown in the preset switcher.
- **Layout attribute** — the variable used to position the nodes for this preset.
- **Grouping attribute** (optional) — a categorical variable used to draw convex hulls around the nodes that share each value.
- **Displayed edges** (optional) — one or more edge types to draw. Each edge type that you choose also needs a label, which participants see in the preset switcher. It starts as the edge type's name, and you can translate it like any other translatable string.
- **Node highlighting** (optional) — one or more boolean variables; nodes whose value is true are highlighted while the preset is active. Each variable that you choose also needs a label, which participants see in the preset switcher. The label starts as the variable's name, and you can translate it like any other translatable string (see [Translating Your Protocol](/en/design-protocols/tutorials/translating-your-protocol#labels-in-a-narrative-stages-legend)).

The group, edge, and highlight options each pick from the variables already in your codebook, so define the variables that a preset needs before you build it.

### Filtering a preset

<AppOnly app="current">

Turn on **Preset filter** in a preset to limit that preset to part of the network. You build the filter from rules, in the same way as a [network filter](/en/design-protocols/key-concepts/network-filtering) on any other stage: each rule tests an attribute of a node, or whether a node has an edge of a given type, and you choose whether a node must match every rule or any one of them. A filtered preset draws only the nodes that match, and only the edges between them.

A preset with no filter shows everyone who has a position in its layout attribute. The Narrative stage has no filter of its own, so to show the same part of the network throughout, give each preset the same filter.

Switching presets during the interview switches filters too. Nodes that the new preset filters out leave the canvas, and nodes that it lets in appear.

A Narrative stage is left out of the interview when none of its presets has anyone to show, unless **Free-draw** is on.

</AppOnly>

<AppOnly app="classic">

In Architect Classic a filter belongs to the whole Narrative stage, and applies to every preset. Turn on **Network Filtering** in the stage editor to set it (see [Network Filtering](/en/design-protocols/key-concepts/network-filtering)).

</AppOnly>

### Background

Like the Sociogram, a Narrative stage can sit on either a series of concentric circles or a custom background image. A responsive SVG works best as an image background, because it keeps regions and labels readable as the canvas changes shape. See [Creating responsive background images](/en/design-protocols/tutorials/responsive-svg-backgrounds) for how to prepare one.

### Behaviors

Three stage-level behaviors change how participants can interact with the canvas:

- **Automatic layout** applies a force-directed layout that gently refines the stored node positions and draws grouped nodes together into their hulls. With it off, the positions from the layout variable are shown as they were laid out.
- **Allow repositioning** lets the participant drag nodes around the canvas.
- **Free-draw** turns on annotation tools, so the participant or researcher can draw freehand over the network with a mouse, finger, or stylus.

<AppOnly app="current">

### Customize built-in wording

The **Customize built-in wording** section of the stage editor contains the headings of the panels, under **Specific to this stage**. Each heading starts with the wording supplied by Network Canvas, in every language for which it has wording, and you can change and translate it like any other translatable string. Your protocol contains only the wording that you change (see [Words supplied by Network Canvas](/en/design-protocols/tutorials/translating-your-protocol#words-network-canvas-supplies)). A heading is in the section only while a preset highlights attributes, shows links or groups nodes, and it is removed when no preset does.

The tooltips of the drawing tools are the same on every Narrative stage, so they are under **Shared by every stage of this kind**, in the same section, while **Free-draw** is on. A change to them applies to every such stage, and is saved as soon as you leave the field. There are three: **Toggle drawing tooltip** names the button that switches drawing on and off, **Toggle freezing annotations tooltip** names the button that freezes and unfreezes annotations, and **Reset annotations tooltip** names the button that clears them.

The tooltips for pausing and resuming the automatic layout are [interview text](/en/design-protocols/tutorials/translating-your-protocol#interview-text), shared with the Sociogram, and are reworded and translated in the translation table under **Buttons**.

</AppOnly>

## Designing presets around your research questions

A preset is a lens on the network, so design each one to open a specific line of questioning that you want to raise in the interview. Keep each preset focused — one clear idea per view is easier for a participant to read and easier for you to talk about.

<GoodPractice>

Give each preset a single focus that maps to one question, and label it accordingly — for example a "Support" preset that highlights who provides support, or a "Groups" preset that shows how the network divides into communities. The label is visible to the participant, so a short, meaningful name helps them follow the conversation as you switch views.

</GoodPractice>

<GoodPractice>

Because the Narrative only shows alters that have a value for the preset's layout variable, reuse the layout variable that your participants populated on an earlier [Sociogram](/en/design-protocols/interface-documentation/sociogram). This replays their own arrangement of the network rather than starting from an empty canvas.

</GoodPractice>

<AppOnly app="current">

<GoodPractice>

Use preset filters to move from the whole network to the part that a question is about. A first preset with no filter shows everyone; later presets can narrow to family, to the people who provide support, or to the people connected by one kind of tie, all without leaving the stage or losing the participant's arrangement.

</GoodPractice>

</AppOnly>

## Capturing the conversation

Free-draw annotations are a live discussion aid, not saved data. An annotation fades after a few seconds unless you freeze it, and nothing drawn on the canvas is recorded with the interview. Because the Narrative collects nothing itself, plan separately for how you will capture the discussion that it prompts — for example by using screen-recording and audio-recording software to keep a record of what is said and drawn.

### Try to Avoid

<BadPractice>

Don't rely on the Narrative to collect data. It is display-only; if you need to record an attribute or a tie that a participant identifies while talking, gather it on a data-collecting stage such as the [Sociogram](/en/design-protocols/interface-documentation/sociogram) or a name interpreter.

</BadPractice>

<BadPractice>

Avoid crowding a single preset with every group, edge type, and attribute at once. A dense view is hard to read and hard to discuss. Separate concerns into distinct presets and switch between them.

</BadPractice>
