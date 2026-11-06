<!--
  Walkthrough for the "Categorical Bin" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (CategoricalBin.md).
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

# Categorical Bin

## What a categorical bin is

<!-- scene: categorical-bin-intro -->

The Categorical Bin is a name interpreter: it collects information about alters already named, rather than creating new ones. Participants drag each alter from the drawer at the bottom of the screen into one of a set of coloured circles, each one category, such as _Family_, _Work_ or _School_. Tapping a circle opens it, so the alters inside can be moved to another category.

Read the full [Categorical Bin documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/categorical-bin).

## What data it collects

<!-- scene: categorical-bin-data -->

Each prompt records one categorical attribute. The circle an alter is placed in sets that attribute's value. In exported data the attribute becomes one true or false column for each category, named after the attribute and the category's value, such as `group_family`, so a placed alter has true in the column for its circle. An answer typed into the other circle is kept in its own column.

## When to use it

Use this stage to sort alters into categories that have no order.

> Do: Use it to collect nominal data on alters. A toggle button group [input control](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls) on another interface can collect the same data, but dragging alters into bins is more tactile and engaging for participants.

> Avoid: More than eight categories. More make the category labels hard to read and crowd the rest of the screen.

> Avoid: Dichotomous variables. A yes-or-no answer is better collected with a toggle [input control](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls) on a [Name Generator](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-forms) or [Per Alter Form](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/per-alter-form), or by attribute toggling on a [Sociogram](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram).

## Choose what this stage shows

<!-- section: Node setup -->

Pick the **node type** this stage sorts, for example _Person_. Every node of that type already in the participant's network waits in the drawer.

Changing the node type later removes the rest of this stage's settings, apart from its name and interviewer notes, since they all describe the type chosen now. Architect asks before it does.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Write the prompts

<!-- section: Prompt collection -->

Each prompt asks one question and sorts the alters by one categorical attribute. The participant moves through the prompts in order. An alter waits in the drawer until it has a value for the current prompt's attribute, or an answer for its other circle.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question the participant reads above the circles, such as _"Which of these best describes how you know each person?"_.

## Choose the categories

<!-- dialog: create prompt | edit prompt -->
<!-- field: variable -->

Under **Categorical response**, pick the categorical attribute this prompt records. Each of its values becomes a circle. A prompt can have at most ten circles, counting the other circle below if it is switched on, and the editor will not save one with more.

## Set the category labels

<!-- dialog: create prompt | edit prompt -->

The attribute's values are listed under it, and you edit them here: each has a label the participant reads on its circle and a value saved in your data. They are saved when you save the prompt. Labels can be a short sentence; check your longest one in [Preview](https://documentation.networkcanvas.com/en/design-protocols/preview-mode).

## Offer an other bin

<!-- dialog: create prompt | edit prompt -->
<!-- scene: categorical-bin-other -->

Switch on **Follow-up other option** to add one more circle for alters none of the categories describe. Choose the **Other attribute**, a text attribute that stores what the participant types, and give the circle an **Other bin label**, such as _Other_.

## Ask the follow-up question

<!-- dialog: create prompt | edit prompt -->

The **Follow-up question** appears as soon as an alter is dropped in the other circle, with a box for the participant's answer. Ask for the detail you need, such as _"How do you know this person?"_.

<!-- include: bin-sort-orders -->

## Create the category attribute

<!-- dialog: create a new attribute -->

Typing a new name in the attribute picker opens this window with that name filled in, since a categorical attribute is its list of values. Add its values, each with a label and a value.

<!-- include: attribute-search -->

## Choose how alters are placed

<!-- section: Placing nodes -->
<!-- field: behaviours.interactionMode -->
<!-- scene: categorical-bin-tap -->

**Interaction mode** decides how the participant puts each alter into a bin. With **Drag and drop**, they drag each one from the drawer at the bottom of the screen. With **Tap to place**, one alter in the drawer is selected, they tap the circle it belongs in, and the next alter is selected.

## Require every alter to be placed

<!-- section: Placing nodes -->
<!-- field: behaviours.requireCompletePlacement -->
<!-- scene: categorical-bin-require -->

Switch on **Require every node to be placed** to stop the participant leaving a prompt while any alter is still in the drawer. If they try, they are told to place every one first.

## Customize built-in wording

<!-- section: Customize built-in wording -->

While **Require every node to be placed** is switched on, this section holds **Nodes not yet placed**, the message shown when the participant tries to continue with alters still in the drawer. It can include the node type's name, so choose a name that reads naturally to participants.

Once the protocol has a Categorical Bin stage, the section also holds **Place here**, the button on an opened circle while **Tap to place** is on. It is under **Shared by every stage of this kind**, so changing it changes every Categorical Bin stage.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
