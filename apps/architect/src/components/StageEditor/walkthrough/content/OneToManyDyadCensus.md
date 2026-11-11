<!--
  Walkthrough for the "One to Many Dyad Census" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (OneToManyDyadCensus.md).
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

# One to Many Dyad Census

## What a one to many dyad census is

<!-- scene: one-to-many-intro -->

The One to Many Dyad Census is a name interpreter that collects edges between alters already named. Unlike the [Dyad Census](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/dyad-census), it does not ask about one pair at a time. Instead, it shows the participant one alter, the **focal node**, above a list of the other alters. The participant taps every alter in the list that the question applies to, then moves on to the next focal node.

Read the full [One to Many Dyad Census documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/one-to-many-dyad-census).

## What data it collects

<!-- scene: one-to-many-data -->

This stage collects edges between alters already named. Each alter the participant taps is joined to the focal node by one edge of the edge type set on the prompt, and each edge is one row in your exported edge list. Tapping a selected alter again removes its edge, so nothing is exported for that pair.

## When to use it

> Do: Use this interface to encourage participants to add edges that they might not have considered, especially when one alter has relationships with multiple others.

> Do: Use this interface in favor of the standard Dyad Census when you expect that one alter will have many relationships with others, as it simplifies the process for participants.

> Avoid: Using this interface with a large number of alters, which will still result in many screens. There is one screen per focal node, so the number of screens grows in line with the number of alters. If you have many alters, consider other methods to collect edges, such as the [Sociogram](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/sociogram).

## Choose what this stage shows

<!-- section: Node setup -->

Choose the **node type** whose alters are asked about, such as _Person_. Each node of that type already in the participant's network takes a turn as the focal node. If there are fewer than two nodes of that type, the stage is skipped.

Changing the node type later clears this stage's other settings, because they depend on the node type. Only the stage's name and interviewer notes are kept. Architect asks you to confirm first.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Write the prompts

<!-- section: Prompt collection -->

Each prompt asks about one kind of relationship. The participant goes through every focal node for the first prompt, then every focal node again for the next.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question shown above the focal node, such as _"Which of these people does Sam know?"_. Ask about the focal node and the whole list, rather than about a single pair. To name the focal node in the question, use the syringe button in the toolbar to insert **Node label**.

## Choose the edge a tap creates

<!-- dialog: create prompt | edit prompt -->
<!-- field: createEdge -->

**Created edge type** sets which edge type a tap creates between the focal node and the alter tapped. If the two alters already have an edge of that type in either direction, for example from a sociogram, the alter appears already selected, and tapping it removes the edge.

Once you choose an edge type, you can switch on the two sort orders below it, **Bucket order** and **Bin order**.

## Order the focal nodes

<!-- dialog: create prompt | edit prompt -->

Switch on **Bucket order** to set the order in which alters take their turn as the focal node, sorted by one or more attributes, such as name. Without sort rules, alters take their turn in the order they were added.

## Order the list of other alters

<!-- dialog: create prompt | edit prompt -->

Switch on **Bin order** to set the order in which the other alters are listed below the focal node. Without sort rules, the other alters are listed in the order they were added.

<!-- include: edge-type -->

## Choose what happens after a turn

<!-- section: Node availability -->
<!-- field: behaviours.removeAfterConsideration -->
<!-- scene: one-to-many-remove -->

**Removal behavior** decides whether an alter stays in the list after it has been the focal node.

- **Remove them from the list** asks about every pair only once. Each turn has a shorter list, and the last alter never takes a turn of its own.
- **Keep them in the list** shows every other alter on every turn. Each pair comes up twice, once from each side, and edges already made show as selected.

New stages start with **Remove them from the list**.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
