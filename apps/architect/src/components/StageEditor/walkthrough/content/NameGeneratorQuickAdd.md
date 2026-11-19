<!--
  Walkthrough for the "Name Generator (using quick add)" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGeneratorQuickAdd.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images).
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

<!-- include: name-generator-intro -->

## This one uses quick add

<!-- scene: name-generator-intro -->

In the Name Generator (using quick add), the add button opens a text box. The participant types a short label, usually a name, and presses Enter to add the alter. The text box remains open so that multiple alters can be added consecutively. This is the quickest way to name many alters.

Read the full [Name Generator using Quick Add documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-quick-add).

<!-- include: node-type -->

## Specify the attribute

<!-- section: quick-add -->
<!-- field: quickAdd -->

Whatever the participant types into the box is saved to one text **attribute**. Select an attribute the node type already has, or create a new one. The attribute picker lists only text attributes.

> Do: Use an attribute called `name` unless you have a good reason to use another. By default, Network Canvas will label nodes using this variable throughout the interview.

Read more about [node labeling](https://documentation.networkcanvas.com/design-protocols/key-concepts/node-labelling).

## Decide whether an answer is required

<!-- section: quick-add -->

The **Validation** section under the picker configures rules for what the participant can enter in the quick add attribute.

These rules belong to the attribute in the codebook, so a change applies wherever a value for this attribute is set, not only on this stage.

Read more about [field validation](https://documentation.networkcanvas.com/design-protocols/key-concepts/field-validation).

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
