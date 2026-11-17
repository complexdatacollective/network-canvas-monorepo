<!--
  Walkthrough for the "Name Generator (using quick add)" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGeneratorQuickAdd.md).
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

# Name Generator (using quick add)

## What a name generator is

<!-- scene: name-generator-intro -->

Name generators are a fundamental part of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations. Each alter named on this stage is saved as a node, so later stages can ask about these alters, place them, or connect them.

The form and quick-add name generators have the same parts: a **prompt** that explains the task, a **list** of the alters named so far, a **button** that adds an alter, and optionally one or two **side panels**.

Read the full [Name Generator using Quick Add documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-quick-add).

## This one uses quick add

In the Name Generator (using quick add), the add button opens a text box. The participant types a short label, usually a name, and presses Enter to add the alter. This is the quickest way to name many alters.

If you also want to ask a few questions about each alter as it is named, use the [Name Generator (using forms)](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-forms). If you already have a list of the alters participants might name, use the [Name Generator for Roster Data](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-roster).

## When to use it

Use this stage when you want participants to name alters quickly, without collecting anything else about them at the same time.

> Do: Use this Interface when you want to elicit nodes quickly without the burden of collecting other attribute data at the same time.

> Avoid: Adding additional attributes on this stage that could more accurately be collected elsewhere.

## Choose what this stage creates

<!-- section: node-type -->

Choose the **node type** this stage creates, such as _Person_. Each alter named here becomes a node of that type, and what the participant types is saved as one of that type's attributes.

If the type you need does not exist yet, you can create it here.

## Choose what quick add records

<!-- section: quick-add -->
<!-- field: quickAdd -->

Whatever the participant types into the box is saved to one text **attribute**. Select an attribute the node type already has, or create a new one. The attribute picker lists only text attributes.

> Do: Use an attribute called `name` unless you have a good reason to use another. Keep in mind that Network Canvas will label nodes using this variable throughout the interview.

Read more about [node labeling](https://documentation.networkcanvas.com/design-protocols/key-concepts/node-labelling).

## Decide whether an answer is required

<!-- section: quick-add -->

The **Validation** section under the picker holds the rules for what the participant types. A new attribute created here starts out required, because it is the only thing recorded for each alter.

These rules belong to the attribute in the codebook, so a change applies wherever a value for this attribute is typed in, not only on this stage.

Read more about [field validation](https://documentation.networkcanvas.com/design-protocols/key-concepts/field-validation).

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
