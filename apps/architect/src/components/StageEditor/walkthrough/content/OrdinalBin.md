<!--
  Walkthrough for the "Ordinal Bin" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (OrdinalBin.md).
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

# Ordinal Bin

## What an ordinal bin is

<!-- scene: ordinal-bin-intro -->

The Ordinal Bin is a name interpreter: it collects information about alters already named, rather than creating new ones. Participants drag each alter from the drawer at the bottom of the screen into a **bin**. The bins sit in a row and are ordered along a scale, such as from _Not close_ to _Extremely close_. After placing an alter, the participant can move it to another bin.

Read the full [Ordinal Bin documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/ordinal-bin).

## What data it collects

<!-- scene: ordinal-bin-data -->

This stage collects one ordinal attribute for each prompt. The bin an alter is placed in sets the value of that attribute. In your exported data, each prompt's attribute is one column, with a value for every alter placed.

## When to use it

Use this stage to rate alters on an ordered scale.

> Do: Use it to collect ordinal or interval scale data on alters. A Likert scale [input control](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls) on another interface can collect the same data, but dragging alters into bins is more tactile and engaging for participants.

> Avoid: Scales of more than six bins. Larger scales make the bin labels hard to read and crowd the rest of the screen.

> Avoid: Collecting nominal data that would suit the [Categorical Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/categorical-bin) better.

## Choose what this stage shows

<!-- section: Node setup -->

Choose the **node type** this stage sorts, such as _Person_. Every node of that type already in the participant's network waits in the drawer.

Changing the node type later clears this stage's other settings, because they depend on the node type. Only the stage's name and interviewer notes are kept. Architect asks you to confirm first.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Write the prompts

<!-- section: Prompt collection -->

Each prompt asks one question and sorts the alters by one ordinal attribute. The participant sees one prompt at a time, in the order you set. An alter waits in the drawer until it has a value for the current prompt's attribute, so if a prompt reuses an earlier prompt's attribute, the alters placed on the earlier prompt start out in their bins.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question the participant reads above the bins, such as _"How close do you feel to each of these people?"_.

## Choose the scale

<!-- dialog: create prompt | edit prompt -->
<!-- field: variable -->

Under **Ordinal response**, pick the ordinal attribute this prompt records. Its values become the bins, in the attribute's own order. The bins run left to right, or top to bottom on a portrait screen. Architect warns you when the attribute has more than six values.

## Set the bin labels

<!-- dialog: create prompt | edit prompt -->

The attribute's values are listed below the picker, and you can edit them here. Each value has a label, which the participant reads on its bin, and a value, which is saved in your data. Your edits are saved when you save the prompt. A label can be as long as a short sentence, but check your longest label in [Preview](https://documentation.networkcanvas.com/en/design-protocols/preview-mode).

## Choose the color gradient

<!-- dialog: create prompt | edit prompt -->
<!-- field: color -->
<!-- scene: ordinal-bin-gradient -->

**Color** sets the color the bins are shaded with. The first bin has the full color, and each bin after it fades a step further into the background, so the bins look like a scale.

<!-- include: bin-sort-orders -->

## Create the scale attribute

<!-- dialog: create a new attribute -->

Typing a new name in the attribute picker opens this window with that name filled in. An ordinal attribute needs a list of values, so add its values here in order, each with a label and a value.

<!-- include: attribute-search -->

## Choose how alters are placed

<!-- section: Placing nodes -->
<!-- field: behaviours.interactionMode -->
<!-- scene: ordinal-bin-tap -->

**Interaction mode** decides how the participant puts each alter into a bin. With **Drag and drop**, the participant drags each alter from the drawer at the bottom of the screen. With **Tap to place**, Network Canvas selects one alter in the drawer, the participant taps the bin that alter belongs in, and the next alter is selected.

## Require every alter to be placed

<!-- section: Placing nodes -->
<!-- field: behaviours.requireCompletePlacement -->
<!-- scene: ordinal-bin-require -->

Switch on **Require every node to be placed** to stop the participant from leaving a prompt while any alter is still in the drawer. If they try, they are told to place every alter first.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section appears only while **Require every node to be placed** is switched on. It holds **Nodes not yet placed**, the message shown when the participant tries to continue with alters still in the drawer. The message can include the node type's name, so give the node type a name that reads naturally to participants.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
