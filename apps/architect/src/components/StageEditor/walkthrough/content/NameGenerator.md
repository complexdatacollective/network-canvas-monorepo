<!--
  Walkthrough for the "Name Generator (using forms)" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGenerator.md).
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

# Name Generator (using forms)

## What a name generator is

<!-- scene: name-generator-intro -->

Name generators are a fundamental part of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations. Each alter named on this stage is saved as a node, so later stages can ask about these alters, place them, or connect them.

The form and quick-add name generators have the same parts: a **prompt** that explains the task, a **list** of the alters named so far, a **button** that adds an alter, and optionally one or two **side panels**.

Read the full [Name Generator using Forms documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-forms).

## This one uses a form

<!-- scene: name-generator-form -->

In the Name Generator (using forms), the add button opens a **form** that the participant fills in to create each node. The form can include one or more fields, each capturing an attribute of the node. This stage therefore lets participants name alters and answer a few basic questions about each one, a task known as name interpreting, at the same time.

If you only need names, the [Name Generator (using quick add)](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-quick-add) is quicker for participants. If you already have a list of the alters they might name, use the [Name Generator for Roster Data](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-roster).

## When to use it

Use this stage when you want to collect a small amount of information about each alter at the moment it is named.

> Do: Use this interface when you want to collect small amounts of attribute data at the same time as a node is elicited. This can be more efficient than adding additional [Per Alter Form](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-form) Interfaces, or dedicated name interpreter Interfaces later.

> Avoid: Resist the urge to create long forms with many items. This may discourage participants from naming additional alters, as it will make the task of nominating an alter more burdensome.

> Avoid: Avoid attributes that might be better considered relative to other nodes in the network. For example, perceptual scales may benefit from using the [Ordinal Bin](https://documentation.networkcanvas.com/design-protocols/interface-documentation/ordinal-bin) Interface.

## Choose what this stage creates

<!-- section: node-type -->

Choose the **node type** this stage creates, such as _Person_. Each alter named here becomes a node of that type, and the answers on the form are saved as attributes of that type.

If the type you need does not exist yet, you can create it here.

## Build the form

<!-- section: form-fields -->
<!-- field: form.title -->
<!-- scene: name-generator-form -->

The form holds the questions the participant answers each time they add a node. The **form title** is the heading shown at the top of the form, such as _Add a person_. Each field below it records one attribute of the node.

> Do: Include a field for an attribute called `name`, so [node labeling](https://documentation.networkcanvas.com/design-protocols/key-concepts/node-labelling) works correctly everywhere else in the interview.

For a new attribute, the input control you choose for its field also sets the kind of data the attribute holds.

Read more about [forms](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms).

## Write the prompts

<!-- section: prompts -->
<!-- scene: name-generator-prompts -->

The prompt explains the task to the participant. It is the question shown at the top of the screen, such as "_Who have you discussed important matters with in the last six months?_" To ask several questions on one stage, add more prompts. The participant sees one prompt at a time, in the order you set.

Each prompt can also set **additional attributes** on every alter added in response to it, such as `discuss_matters` set to true, so your data shows which prompt each alter was added for.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

<!-- include: side-panels -->

## Limit how many alters can be named

<!-- section: nomination-limits -->
<!-- scene: name-generator-limits -->

Switch on this section to set a minimum or maximum number of alters the participant can name. The limits count every alter named on the stage, across all of its prompts.

Once the participant reaches the maximum, the add button is switched off and they are prompted to continue to the next stage. Until they reach the minimum, they can't move past the last prompt.

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
