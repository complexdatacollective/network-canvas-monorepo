<!--
  Walkthrough for the "Name Generator for Roster Data" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGeneratorRoster.md).
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

# Name Generator for Roster Data

## What a name generator is

Name generators are a fundamental part of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations. Each alter named on this stage is saved as a node, so later stages can ask about these alters, place them, or connect them.

Network Canvas has several name generators, each suited to a different way of naming alters.

Read the full [Name Generator for Roster Data documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-roster).

## This one uses a roster

<!-- scene: roster-intro -->

In the Name Generator for Roster Data, the participant does not type anything. Instead, the alters already exist in a **roster**: a data file you import, such as the members of a class or team. The screen is split in two, with a panel of **cards** on one side, one for each entry in the roster, and the participant's network on the other. The participant drags a card across to add that alter, and can drag the alter back to remove it.

If participants should name alters you can't list in advance, use the [Name Generator (using forms)](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-forms) or the [Name Generator (using quick add)](https://documentation.networkcanvas.com/design-protocols/interface-documentation/name-generator-using-quick-add).

## When to use it

Use this stage when participants will nominate from a known set of alters, such as a class, a team or an organization.

> Do: Make sure the roster file has a `name` attribute, so cards and nodes are labeled correctly. See [node labeling](https://documentation.networkcanvas.com/design-protocols/key-concepts/node-labelling).

> Do: Configure the display and sorting options of the cards, to help participants find entries in the roster.

> Avoid: Avoid using this interface with a large roster (>100 nodes) on devices with a software keyboard, particularly where they also have a small (< 9") screen. The software keyboard will cover a substantial area of the screen, and make the process of searching and nominating more tedious.

> Avoid: Making every attribute searchable on a large roster. It slows search down and makes results less accurate, so test your search thoroughly.

> Avoid: Needless sort options. They confuse participants and can cause display problems on small screens; aim for no more than three.

<!-- include: node-type -->

## Choose the roster

<!-- section: roster-source -->
<!-- field: dataSource -->

The roster is the network data file that supplies this stage's alters. Choose the file first, because the later roster settings, such as what the cards show and what can be searched, are chosen from its columns. Once you choose a file, the editor lists the attributes its entries have.

The file is stored inside the protocol. Large rosters are slower to load and search, so test yours on the devices you will use in the field.

Read more about [preparing a roster file](https://documentation.networkcanvas.com/design-protocols/tutorials/working-with-rosters#how-to-create-a-roster).

## Write the prompts

<!-- section: prompts -->

The prompt explains the task to the participant. It is the question shown at the top of the screen, such as "_Which of your classmates do you spend time with outside school?_" To ask several questions on one stage, add more prompts. The participant sees one prompt at a time, in the order you set.

Each prompt can also set **additional attributes** on every alter added in response to it, such as `discuss_matters` set to true, so your data shows which prompt each alter was added for.

Each roster entry can be added only once, so an alter added on the first prompt is no longer in the list on the second.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

## Title the list of cards

<!-- section: roster-panel -->
<!-- field: panelTitle -->

The title is shown above the cards, so participants know what the list is. A new stage starts with the title _Available to add_. Change it to say what the list holds, for example _Your classmates_.

## Choose what each card shows

<!-- section: card-display -->
<!-- scene: roster-card-display -->

Every card is titled with the entry's name from the data file. Switch on **Card display** to list more of the entry's attributes under its name, such as class or department. Each attribute is shown with a label.

Show whatever participants need to tell entries with similar names apart.

Read more about [formatting the display of the roster](https://documentation.networkcanvas.com/design-protocols/tutorials/working-with-rosters#formatting-the-display-of-the-roster).

## Set the starting order

<!-- section: roster-sorting -->

Switch on **Roster sorting** and add a **Sort rule** to choose the order the cards first appear in, such as by surname. Without a sort rule, the cards keep their order from the data file.

## Let participants sort

<!-- section: roster-sorting -->
<!-- scene: roster-sort -->

Each of the **Sortable properties** becomes a button above the cards, with the label you give it. Participants use these buttons to re-sort the list themselves.

## Let participants search

<!-- section: roster-search -->
<!-- scene: roster-search -->

Switch on **Roster search** to put a search box above the cards. Under **Searchable attributes**, choose which attributes a search looks in. While this section is switched off, there is no search box and participants find entries by scrolling.

Each attribute you add makes searching a long roster slower and can make matches less accurate, so choose only the attributes participants are likely to search by.

## Choose how closely searches match

<!-- section: roster-search -->

**Search accuracy** sets how close what the participant types must be to an entry to count as a match, from **Exact** to **Low accuracy**. Low accuracy forgives typos and spelling mistakes. Higher accuracy narrows the results when a roster has many similar names.

As a rule of thumb, the larger the roster, the higher the accuracy should be.

<!-- include: nomination-limits -->

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
