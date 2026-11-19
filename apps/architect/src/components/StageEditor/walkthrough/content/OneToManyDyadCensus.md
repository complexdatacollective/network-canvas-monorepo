<!--
  Walkthrough for the "One to Many Dyad Census" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (OneToManyDyadCensus.md).
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

# One to Many Dyad Census

## What a one to many dyad census is

<!-- scene: one-to-many-intro -->

The One to Many Dyad Census is an edge generator that creates edges between alters already named. Unlike the [Dyad Census](https://documentation.networkcanvas.com/design-protocols/interface-documentation/dyad-census), it does not ask about one pair at a time. Instead, it shows the participant one alter, the **focal node**, above a list of the other alters. The participant taps every alter in the list that the focal node is connected to, then moves on to the next focal node.

Read the full [One to Many Dyad Census documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/one-to-many-dyad-census).

## When to use it

This interface is the lowest-burden method of collecting alter-alter edges, and should be used over other approaches most of the time.

> Do: Use this interface in favor of the standard Dyad Census when you expect that one alter will have many relationships with others, as it simplifies the process for participants.

> Avoid: Using this interface with a large number of alters, which will still result in many screens. There is one screen per focal node, so the number of screens grows in line with the number of alters. If you have many alters, consider other methods to collect edges, such as the [Sociogram](https://documentation.networkcanvas.com/design-protocols/interface-documentation/sociogram).

<!-- include: node-type -->

<!-- include: filter-network -->

## Write the prompts

<!-- section: prompts -->

Each prompt asks about one kind of relationship. Each prompt cycles through every focal node, before advancing to the next prompt.

The **Created edge type** controls what is created by nominating an alter.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

## Behavior

<!-- section: node-availability -->
<!-- field: behaviours.removeAfterConsideration -->
<!-- scene: one-to-many-remove -->

**Removal behavior** decides whether an alter stays in the list after it has been the focal node.

- **Remove them from the list** asks about every pair only once. Each turn has a shorter list, and the last alter never takes a turn of its own.
- **Keep them in the list** shows every other alter on every turn. Each pair comes up twice, once from each side, and edges already made show as selected.

New stages start with **Remove them from the list**.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
