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

The Categorical Bin is a name interpreter designed specifically for categorical attributes. It collects information about alters already named, rather than creating new ones.

Participants place each alter from the drawer at the bottom of the screen into a colored circle. Each circle represents one category value for the categorical attribute, such as _Family_, _Work_ or _School_. Tapping a circle opens it, so the participant can move the alters inside to another category.

Read the full [Categorical Bin documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/categorical-bin).

## When to use it

Use this stage to assign a categorical attribute to alters by sorting them.

> Do: Use it to collect categorical data in a tactile and engaging way.

> Avoid: More than eight categories. More thank this number will make the category labels hard to read and crowd the rest of the screen.

> Avoid: Dichotomous variables. A yes-or-no answer is better collected with a toggle [input control](https://documentation.networkcanvas.com/design-protocols/key-concepts/input-controls) on a [Name Generator](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-forms) or [Per Alter Form](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-form), or by attribute toggling on a [Sociogram](https://documentation.networkcanvas.com/design-protocols/interface-documentation/sociogram).

> Avoid: Several consecutive categorical bin stages. Consider grouping attributes onto a single [Per Alter Form](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-form), or using multiple prompts.

<!-- include: node-type -->

<!-- include: filter-network -->

## Write the prompts

<!-- section: prompts -->

Each prompt asks the participant a question and selects a categorical attribute used to generate the circles. You can define multiple prompts to collect multiple attributes. The participant sees one prompt at a time, in the order you set, and moves to the next prompt using the next button.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

## Choose how alters are placed

<!-- section: placing-nodes -->
<!-- field: behaviours.interactionMode -->
<!-- scene: categorical-bin-tap -->

**Interaction mode** decides how the participant puts each alter into a circle. With **Drag and drop**, the participant drags each alter from the drawer at the bottom of the screen. With **Tap to place**, Network Canvas selects one alter in the drawer, the participant taps the circle that alter belongs in, and the next alter is selected.

> Avoid: Don't use drag and drop if your research population may have issues with performing the interaction. For example those using a mouse who might find accurate movement while holding a button down difficult.

> Do: Use drag and drop in situations where it feels natural and comfortable, such as when using a touch screen device for interviews.

## Require every alter to be placed

<!-- section: placing-nodes -->
<!-- field: behaviours.requireCompletePlacement -->
<!-- scene: categorical-bin-require -->

Switch on **Require every node to be placed** to stop the participant from leaving a prompt while any alter is still in the drawer.

> Avoid: Turning this option on when there is no "other"/"don't know"/"don't want to answer" option available.

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
