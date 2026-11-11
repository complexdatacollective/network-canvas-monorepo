<!--
  Walkthrough for the "Name Generator for Roster Data" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGeneratorRoster.md).
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

# Name Generator for Roster Data

## What a name generator is

Name generators are a fundamental part of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations. Each alter named on this stage is saved as a node, so later stages can ask about these alters, place them, or connect them.

Network Canvas has several name generators, each suited to a different way of naming alters.

Read the full [Name Generator for Roster Data documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-roster).

## This one uses a roster

<!-- scene: roster-intro -->

In the Name Generator for Roster Data, the participant does not type anything. Instead, the alters already exist in a **roster**: a data file you import, such as the members of a class or team. The screen is split in two, with a panel of **cards** on one side, one for each entry in the roster, and the participant's network on the other. The participant drags a card across to add that alter, and can drag the alter back to remove it.

If participants should name alters you can't list in advance, use the [Name Generator (using forms)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-forms) or the [Name Generator (using quick add)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-quick-add).

## What data it collects

<!-- scene: roster-data -->

This stage collects alters from the roster, along with what the roster records about each one. Each card the participant adds becomes one node in the network and one row in your exported data, and every column of the alter's roster row is copied onto the node as an attribute.

Once an alter is added, its card leaves the list for the rest of the interview, so each roster entry can be added only once.

## When to use it

Use this stage when participants will nominate from a known set of alters, such as a class, a team or an organization.

> Do: Make sure the roster file has a `name` attribute, so cards and nodes are labeled correctly. See [node labeling](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/node-labelling).

> Do: Configure the display and sorting options of the cards, to help participants find entries in the roster.

> Avoid: Avoid using this interface with a large roster (>100 nodes) on devices with a software keyboard, particularly where they also have a small (< 9") screen. The software keyboard will cover a substantial area of the screen, and make the process of searching and nominating more tedious.

> Avoid: Making every attribute searchable on a large roster. It slows search down and makes results less accurate, so test your search thoroughly.

> Avoid: Needless sort options. They confuse participants and can cause display problems on small screens; aim for no more than three.

## Choose what this stage creates

<!-- section: Node setup -->

Choose the **node type** this stage creates, such as _Person_. Each alter added here becomes a node of that type.

If the type you need does not exist yet, you can create it here.

<!-- include: node-type -->

## Choose the roster

<!-- section: Roster source -->
<!-- field: dataSource -->

The roster is the network data file that supplies this stage's alters. Choose the file first, because the later roster settings, such as what the cards show and what can be searched, are chosen from its columns. Once you choose a file, the editor lists the attributes its entries have.

Read more about [preparing a roster file](https://documentation.networkcanvas.com/en/design-protocols/tutorials/working-with-rosters#how-to-create-a-roster).

<!-- include: data-file -->

## Write the prompts

<!-- section: Prompt collection -->

The prompt explains the task to the participant. It is the question shown at the top of the screen, such as "_Which of your classmates do you spend time with outside school?_" To ask several questions on one stage, add more prompts. The participant sees one prompt at a time, in the order you set.

Each roster entry can be added only once, so an alter added on the first prompt is no longer in the list on the second.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

<!-- include: name-generator-prompts -->

## Title the list of cards

<!-- section: Roster panel -->
<!-- field: panelTitle -->

The title is shown above the cards, so participants know what the list is. A new stage starts with the title _Available to add_. Change it to say what the list holds, for example _Your classmates_.

## Choose what each card shows

<!-- section: Card display -->
<!-- scene: roster-card-display -->

Every card is titled with the entry's name from the data file. Switch on **Card display** to list more of the entry's attributes under its name, such as class or department. Each attribute is shown with a label.

Show whatever participants need to tell entries with similar names apart.

Read more about [formatting the display of the roster](https://documentation.networkcanvas.com/en/design-protocols/tutorials/working-with-rosters#formatting-the-display-of-the-roster).

## Set the starting order

<!-- section: Roster sorting -->

Switch on **Roster sorting** and add a **Sort rule** to choose the order the cards first appear in, such as by surname. Without a sort rule, the cards keep their order from the data file.

## Let participants sort

<!-- section: Roster sorting -->
<!-- scene: roster-sort -->

Each of the **Sortable properties** becomes a button above the cards, with the label you give it. Participants use these buttons to re-sort the list themselves.

## Let participants search

<!-- section: Roster search -->
<!-- scene: roster-search -->

Switch on **Roster search** to put a search box above the cards. Under **Searchable attributes**, choose which attributes a search looks in. While this section is switched off, there is no search box and participants find entries by scrolling.

Each attribute you add makes searching a long roster slower and can make matches less accurate, so choose only the attributes participants are likely to search by.

## Choose how closely searches match

<!-- section: Roster search -->

**Search accuracy** sets how close what the participant types must be to an entry to count as a match, from **Exact** to **Low accuracy**. Low accuracy forgives typos and spelling mistakes. Higher accuracy narrows the results when a roster has many similar names.

As a rule of thumb, the larger the roster, the higher the accuracy should be.

## Limit how many alters can be named

<!-- section: Nomination limits -->
<!-- scene: roster-limits -->

Switch on this section to set a minimum or maximum number of alters the participant can add. The limits count every alter added on the stage, across all of its prompts.

Once the participant reaches the maximum, the cards can no longer be dragged and they are prompted to continue to the next stage. Until they reach the minimum, they can't move past the last prompt.

## Customize built-in wording

<!-- section: Customize built-in wording -->

Network Canvas supplies the messages this stage shows. Switch on this section to rewrite them for your study:

- **Minimum not reached** and **Maximum reached**: shown only when the stage has those limits.
- **Everything added**: shown when every card has been added.
- **Unnamed label**: the numbered label for an entry with no name.

These messages can include the node type's name, so give the node type a name that reads naturally to participants.

A message also appears when the participant drags an added alter back to remove it. Its wording is under **Shared by every stage of this kind**, so changing it changes it on every roster stage. **Shared by every stage of this kind** appears only after a roster stage has been saved to the protocol.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
