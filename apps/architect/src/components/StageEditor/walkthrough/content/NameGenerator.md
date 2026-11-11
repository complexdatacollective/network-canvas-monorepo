<!--
  Walkthrough for the "Name Generator (using forms)" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGenerator.md).
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

# Name Generator (using forms)

## What a name generator is

<!-- scene: name-generator-intro -->

Name generators are a fundamental part of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations. Each alter named on this stage is saved as a node, so later stages can ask about these alters, place them, or connect them.

The form and quick-add name generators have the same parts: a **prompt** that explains the task, a **list** of the alters named so far, a **button** that adds an alter, and optionally one or two **side panels**.

Read the full [Name Generator using Forms documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-forms).

## This one uses a form

<!-- scene: name-generator-form -->

In the Name Generator (using forms), the add button opens a **form** that the participant fills in to create each node. The form can include one or more fields, each capturing an attribute of the node. This stage therefore lets participants name alters and answer a few basic questions about each one, a task known as name interpreting, at the same time.

If you only need names, the [Name Generator (using quick add)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-quick-add) is quicker for participants. If you already have a list of the alters they might name, use the [Name Generator for Roster Data](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-roster).

## What data it collects

<!-- scene: name-generator-data -->

This stage collects new alters and attributes of each one. In your exported data, each alter named here is one row, and each field on the form is one column.

## When to use it

Use this stage when you want to collect a small amount of information about each alter at the moment it is named.

> Do: Use this interface when you want to collect small amounts of attribute data at the same time as a node is elicited. This can be more efficient than adding additional [Per Alter Form](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/per-alter-form) Interfaces, or dedicated name interpreter Interfaces later.

> Avoid: Resist the urge to create long forms with many items. This may discourage participants from naming additional alters, as it will make the task of nominating an alter more burdensome.

> Avoid: Avoid attributes that might be better considered relative to other nodes in the network. For example, perceptual scales may benefit from using the [Ordinal Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/ordinal-bin) Interface.

## Choose what this stage creates

<!-- section: Node setup -->

Choose the **node type** this stage creates, such as _Person_. Each alter named here becomes a node of that type, and the answers on the form are saved as attributes of that type.

If the type you need does not exist yet, you can create it here.

<!-- include: node-type -->

## Build the form

<!-- section: Form configuration -->
<!-- field: form.title -->
<!-- scene: name-generator-form -->

The form holds the questions the participant answers each time they add a node. The **form title** is the heading shown at the top of the form, such as _Add a person_. Each field below it records one attribute of the node.

> Do: Include a field for an attribute called `name`, so [node labeling](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/node-labelling) works correctly everywhere else in the interview.

Read more about [forms](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms). To tour the field editor, open a field or create a new one.

<!-- include: node-form-field -->

<!-- include: form-field-details -->

<!-- include: attribute-search -->

## Write the prompts

<!-- section: Prompt collection -->
<!-- scene: name-generator-prompts -->

The prompt explains the task to the participant. It is the question shown at the top of the screen, such as "_Who have you discussed important matters with in the last six months?_" To ask several questions on one stage, add more prompts. The participant sees one prompt at a time, in the order you set.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

<!-- include: name-generator-prompts -->

<!-- include: side-panels -->

<!-- include: data-file -->

<!-- include: rule -->

## Limit how many alters can be named

<!-- section: Nomination limits -->
<!-- scene: name-generator-limits -->

Switch on this section to set a minimum or maximum number of alters the participant can name. The limits count every alter named on the stage, across all of its prompts.

Once the participant reaches the maximum, the add button is switched off and they are prompted to continue to the next stage. Until they reach the minimum, they can't move past the last prompt.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section appears only once the stage has a nomination limit. It holds the **Minimum not reached** and **Maximum reached** messages that Network Canvas supplies. Switch it on to rewrite them for your study. Both messages can include the node type's name, so give the node type a name that reads naturally to participants.

Read more about [translating your protocol](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
