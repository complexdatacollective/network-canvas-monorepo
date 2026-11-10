<!--
  Walkthrough for the "Dyad Census" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (DyadCensus.md).
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

# Dyad Census

## What a dyad census is

<!-- scene: dyad-census-intro -->

The Dyad Census is a name interpreter that collects edges between alters already named. It shows the participant two alters at a time and asks a yes or no question about them. A yes creates an edge between the pair, and answering moves straight on to the next pair, until every pair has been asked about.

Read the full [Dyad Census documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/dyad-census).

## What data it collects

<!-- scene: dyad-census-data -->

Each pair answered yes is joined by one edge of the prompt's edge type, and each edge becomes one row in your exported edge list. A no leaves the pair without that edge, and the no itself is not exported.

## When to use it

<!-- scene: dyad-census-pairs -->

Use this stage to ask about the relationships between alters systematically. The participant needs to know what the task is before they start, so place an [Information](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/information) stage before it.

> Do: Use it to encourage participants to add edges they might not have considered.

> Avoid: Using it with a large number of alters, which results in a large number of screens.

## Choose what this stage shows

<!-- section: Node setup -->

Pick the **node type** whose alters are paired up, for example _Person_. Every pair of nodes of that type already in the participant's network is asked about.

Changing the node type later removes the rest of this stage's settings, apart from its name and interviewer notes, since they all describe the type chosen now. Architect asks before it does.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Write the prompts

<!-- section: Prompt collection -->
<!-- scene: dyad-census-prompts -->

Each prompt asks about one kind of relationship. The participant goes through every pair for the first prompt, then every pair again for the next, so each prompt adds as many screens as there are pairs.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question shown below each pair. Phrase it so that yes and no are both sensible answers, such as _"Do these two know each other?"_. To name the pair in the question, insert **First node: label** and **Second node: label** with the syringe button in the toolbar.

## Choose the edge a yes creates

<!-- dialog: create prompt | edit prompt -->
<!-- field: createEdge -->
<!-- scene: dyad-census-existing -->

**Created edge type** is the edge type a yes creates between the pair. If a pair already has an edge of that type, for example from a sociogram, Yes is already selected when the pair appears, and answering No removes that edge.

<!-- include: edge-type -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
