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

<!-- include: name-generator-intro -->

## This one uses a form

<!-- scene: name-generator-form -->

In the Name Generator (using forms), the add button opens a **form** that the participant fills in to create each node. The form can include one or more fields, each capturing an attribute of the node.

Read the full [Name Generator using Forms documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-forms).

## When to use it

Use this stage when you want to collect a small amount of information about each alter at the moment it is named.

> Do: Use this interface when you want to collect small amounts of attribute data at the same time as a node is elicited. This can be more efficient than adding additional [Per Alter Form](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-form) interfaces, or dedicated name interpreter interfaces later.

> Avoid: Creating long forms with many items. This may discourage participants from naming additional alters, as it will make the task of nominating an alter more burdensome.

> Avoid: Attributes that might be better considered relative to other nodes in the network. For example, perceptual scales may benefit from using the [Ordinal Bin](https://documentation.networkcanvas.com/design-protocols/interface-documentation/ordinal-bin) interface.

> Avoid: Using this interface if you only need names. The [Name Generator (using quick add)](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-quick-add) is quicker for participants.

<!-- include: node-type -->

## Build the form

<!-- section: form-fields -->
<!-- field: form.title -->
<!-- scene: name-generator-form -->

The form contains the questions the participant answers each time they add a node. The **form title** is the heading shown at the top of the form, such as _Add a person_. Each field below it records one attribute of the node.

For a new attribute, the input control you choose for its field also sets the kind of data the attribute holds.

Read more about [forms](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms).

> Do: Include a field for an attribute called `name`, so [node labeling](https://documentation.networkcanvas.com/design-protocols/key-concepts/node-labelling) works correctly everywhere else in the interview.

## Write the prompts

<!-- section: prompts -->
<!-- scene: name-generator-prompts -->

The prompt you choose is critical for name generation, and determines the kind of network that will result from your interview. It is displayed at the top of the screen. Multiple prompts can be used, and the participant moves between them by using the Next and Back buttons.

Each prompt can also set **additional attributes** for every alter added in response to it. This feature allows you to track alters nominated in response to a specific prompt, such as setting `discuss_matters` to true.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

<!-- include: side-panels -->

<!-- include: nomination-limits -->

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
