<!--
  Walkthrough for the "Tie-Strength Census" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (TieStrengthCensus.md).
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

# Tie-Strength Census

## What a tie-strength census is

<!-- scene: tie-strength-intro -->

The Tie-Strength Census is a name interpreter that collects edges between alters already named, and how strong each one is. Like the [Dyad Census](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/dyad-census), it shows the participant two alters at a time, but instead of yes or no they choose a point on a scale, or an option that says there is no tie. Choosing moves straight on to the next pair, until every pair has been asked about.

Read the full [Tie-Strength Census documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/tie-strength-census).

## What data it collects

<!-- scene: tie-strength-data -->

Each pair given a point on the scale is joined by one edge of the prompt's edge type, and the point chosen is saved on that edge in an ordinal attribute. Each edge becomes one row in your exported edge list, with a column named after the attribute holding the value of the point chosen. A pair given the no-tie option has no edge, and adds no row.

## When to use it

<!-- scene: dyad-census-pairs -->

Use this stage to ask about the relationships between alters systematically, and how strong each one is. Every pair is asked about, so each alter added means many more screens.

> Do: Use this interface in scenarios where you are already using a Dyad Census and wish to also collect data about the strength of a tie.

> Avoid: Using this interface in an interview that also uses the Sociogram to create edges.

## Choose what this stage shows

<!-- section: Node setup -->

Pick the **node type** whose alters are paired up, for example _Person_. Every pair of nodes of that type already in the participant's network is asked about.

Changing the node type later removes the rest of this stage's settings, apart from its name and interviewer notes, since they all describe the type chosen now. Architect asks before it does.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Write the prompts

<!-- section: Prompt collection -->

Each prompt asks about one kind of relationship, on its own scale. The participant goes through every pair for the first prompt, then every pair again for the next, so each prompt adds as many screens as there are pairs.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question shown below each pair, such as _"How close are these two to each other?"_. Phrase it so that every point of the scale, and the no-tie option, is a sensible answer. To name the pair in the question, insert **First node: label** and **Second node: label** with the syringe button in the toolbar.

## Choose the edge a rating creates

<!-- dialog: create prompt | edit prompt -->
<!-- field: createEdge -->

**Edge type** is the edge type created between the pair when the participant chooses a point on the scale. Choose it first: the scale is an attribute of this edge type, so choosing a different edge type later clears the attribute.

## Choose the scale

<!-- dialog: create prompt | edit prompt -->
<!-- field: edgeVariable -->
<!-- scene: tie-strength-scale -->

**Ordinal attribute** is the scale this prompt records, an ordinal attribute of the edge type. Its values become the options the participant chooses from, in the attribute's own order, left to right. The editor warns you when it has more than five.

> Avoid: Ordinal variables with more than 5 options, since this will create a very crowded interface.

If the pair already has an edge of this type with a value for this attribute, that option is already chosen when the pair appears. An edge without one, for example from a sociogram, is asked about as if it were new.

## Set the scale labels

<!-- dialog: create prompt | edit prompt -->

The attribute's values are listed under it, and you edit them here: each has a label the participant reads on its option and a value saved in your data. They are saved when you save the prompt.

## Name the no-tie option

<!-- dialog: create prompt | edit prompt -->
<!-- field: negativeLabel -->
<!-- scene: tie-strength-decline -->

The **Decline option** is the last option, on the far right, for a pair with no tie, such as _"Don't know each other"_. Choosing it creates no edge, and removes an edge of this type the pair already had. The participant must choose an option before moving on.

<!-- include: edge-type -->

## Create the scale attribute

<!-- dialog: create a new attribute -->

Typing a new name in the attribute picker opens this window with that name filled in, since an ordinal attribute is its list of values. Add its values in order, each with a label and a value.

<!-- include: attribute-search -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
