<!--
  Walkthrough for the "Tie-Strength Census" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (TieStrengthCensus.md).
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

# Tie-Strength Census

## What a tie-strength census is

<!-- scene: tie-strength-intro -->

The Tie-Strength Census is an **edge generator** and **edge interpreter** that creates edges between alters, along with an ordinal attribute reflecting how strong each tie is. Like the [Dyad Census](https://documentation.networkcanvas.com/design-protocols/interface-documentation/dyad-census), it shows the participant two alters at a time. Instead of answering yes or no, the participant chooses an option on a scale, or an option that says there is no tie. Once they choose, the next pair appears, until every pair has been asked about.

Read the full [Tie-Strength Census documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/tie-strength-census).

## When to use it

<!-- scene: dyad-census-pairs -->

Use this stage to ask systematically about the relationships between alters and how strong each one is. Every pair is asked about, so each additional alter means many more screens.

> Do: Use this interface in scenarios where you are already using a Dyad Census and wish to also collect data about the strength of a tie.

> Avoid: Using this interface in large networks, since it has high response burden and scales poorly with alter count.

<!-- include: node-type -->

<!-- include: filter-network -->

## Write the prompts

<!-- section: prompts -->

Each prompt asks the participant about one kind of relationship, and requires configuring an edge type and an ordinal attribute. The participant goes through every pair for the first prompt, then every pair again for the next, so each prompt adds as many steps as there are pairs.

Choosing the **Decline option** creates no edge and removes any edge of this type the pair already had.

> Avoid: Ordinal variables with more than 5 options, since this will create a very crowded interface.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
