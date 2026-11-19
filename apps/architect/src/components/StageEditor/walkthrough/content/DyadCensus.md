<!--
  Walkthrough for the "Dyad Census" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (DyadCensus.md).
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

# Dyad Census

## What a dyad census is

<!-- scene: dyad-census-intro -->

The Dyad Census is an edge generator that systematically shows every possible pair of alters and asks the participant to confirm or deny if there is an edge between them.

Answering yes creates an edge, and answering no is recorded in the interview session but not in the network data. Either answer moves the participant straight on to the next pair, until every pair has been asked about.

Read the full [Dyad Census documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/dyad-census).

## When to use it

<!-- scene: dyad-census-pairs -->

Use this stage to systematically survey edges between alters, specifically in situations where every possible pair must be confirmed or refused.

> Do: Use this interface when you need every possible pair to be considered.

> Avoid: Using it with a large number of alters, which results in a large number of screens. This is the most high-burden way to collect alter-alter edge data.

> Do: Consider using alternative methods of capturing alter-alter edges instead, such as the one-to-many dyad census, or the sociogram.

## Choose the node type

<!-- section: node-type -->

Choose the **node type** whose alters are paired up, such as _Person_. The participant is asked about every pair of nodes of that type already in their network.

Changing the node type later clears this stage's other settings, because they depend on the node type.

<!-- include: filter-network -->

## Write the prompts

<!-- section: prompts -->
<!-- scene: dyad-census-prompts -->

Each prompt asks about one kind of relationship. The participant goes through every pair for the first prompt, then every pair again for the next, so each prompt adds as many screens as there are pairs.

Each prompt's **Created edge type** is the edge a yes creates. If a pair already has an edge of that type, for example from a sociogram, **Yes** is already selected, and answering **No** removes that edge.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
