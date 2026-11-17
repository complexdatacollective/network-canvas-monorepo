<!--
  Walkthrough for the "Categorical Bin" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (CategoricalBin.md).
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

# Categorical Bin

## What a categorical bin is

<!-- scene: categorical-bin-intro -->

The Categorical Bin is a name interpreter: it collects information about alters already named, rather than creating new ones. Participants drag each alter from the drawer at the bottom of the screen into a colored circle. Each circle stands for one category, such as _Family_, _Work_ or _School_. Tapping a circle opens it, so the participant can move the alters inside to another category.

Read the full [Categorical Bin documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/categorical-bin).

## What data it collects

<!-- scene: categorical-bin-data -->

This stage collects one categorical attribute for each prompt. The circle an alter is placed in sets the value of that attribute. In your exported data, the attribute becomes one true or false column for each category, named after the attribute and the category's value, such as `group_family`. A placed alter has true in the column for its circle. If a prompt offers an Other circle, the answer the participant types for it is kept in its own column.

## When to use it

Use this stage to sort alters into categories that have no order.

> Do: Use it to collect nominal data on alters. A toggle button group [input control](https://documentation.networkcanvas.com/design-protocols/key-concepts/input-controls) on another interface can collect the same data, but dragging alters into bins is more tactile and engaging for participants.

> Avoid: More than eight categories. More make the category labels hard to read and crowd the rest of the screen.

> Avoid: Dichotomous variables. A yes-or-no answer is better collected with a toggle [input control](https://documentation.networkcanvas.com/design-protocols/key-concepts/input-controls) on a [Name Generator](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-forms) or [Per Alter Form](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-form), or by attribute toggling on a [Sociogram](https://documentation.networkcanvas.com/design-protocols/interface-documentation/sociogram).

## Choose what this stage shows

<!-- section: node-type -->

Choose the **node type** this stage sorts, such as _Person_. Every node of that type already in the participant's network waits in the drawer.

Changing the node type later clears this stage's other settings, because they depend on the node type. Only the stage's name and interviewer notes are kept. Architect asks you to confirm first.

<!-- include: stage-filter -->

## Write the prompts

<!-- section: prompts -->

Each prompt asks one question and sorts the alters by one categorical attribute. The participant sees one prompt at a time, in the order you set. An alter waits in the drawer until it has a value for the current prompt's attribute, or an answer for the prompt's Other circle.

Each of the attribute's values becomes a circle. A prompt can have at most ten circles, including the Other circle you add with **Follow-up other option**, which asks a follow-up question and saves the answer in a text attribute.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

## Choose how alters are placed

<!-- section: placing-nodes -->
<!-- field: behaviours.interactionMode -->
<!-- scene: categorical-bin-tap -->

**Interaction mode** decides how the participant puts each alter into a circle. With **Drag and drop**, the participant drags each alter from the drawer at the bottom of the screen. With **Tap to place**, Network Canvas selects one alter in the drawer, the participant taps the circle that alter belongs in, and the next alter is selected.

## Require every alter to be placed

<!-- section: placing-nodes -->
<!-- field: behaviours.requireCompletePlacement -->
<!-- scene: categorical-bin-require -->

Switch on **Require every node to be placed** to stop the participant from leaving a prompt while any alter is still in the drawer. If they try, they are told to place every alter first.

## Customize built-in wording

<!-- section: built-in-wording -->

While **Require every node to be placed** is switched on, this section holds **Nodes not yet placed**, the message shown when the participant tries to continue with alters still in the drawer. The message can include the node type's name, so give the node type a name that reads naturally to participants.

Once the protocol has a Categorical Bin stage, the section also holds **Place here**, the wording of the button on an opened circle while **Tap to place** is on. It is under **Shared by every stage of this kind**, so changing it changes it on every Categorical Bin stage.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
