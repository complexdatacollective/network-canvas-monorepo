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

Name generators are one of the fundamental parts of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations, one of the two main things your network data describes. Each alter they add becomes a node, and later stages such as sociograms, bins and follow-up questions work with the alters named here.

Network Canvas has several name generators, each suited to a different way of naming alters.

Read the full [Name Generator for Roster Data documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-roster).

## This one uses a roster

<!-- scene: roster-intro -->

In the Name Generator for Roster Data, nothing is typed in. The alters already exist in a **roster**: a data file you import, such as the members of a class or team. The screen is split in two: a panel of **cards**, one for each entry in the roster, and the participant's network beside it. The participant drags a card across to add that alter, and can drag it back to remove it.

If participants should name alters you can't list in advance, use the [Name Generator (using forms)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-forms) or the [Name Generator (using quick add)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-quick-add).

## What data it collects

<!-- scene: roster-data -->

Every card the participant adds becomes one node in the network, and one row in your exported data. The node carries the columns of its roster row as attributes, so whatever the file records about it comes with it.

Once added, an alter leaves the list of cards for the rest of the interview, so each roster entry can be added once.

## When to use it

Use this stage when you have a known set of alters your participant might nominate from, such as a class, a team or an organization.

> Do: Make sure the roster file has a `name` attribute, so cards and nodes are labeled correctly. See [node labeling](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/node-labelling).

> Do: Configure the display and sorting options of the cards, to help participants find entries in the roster.

> Avoid: Large rosters (more than 100 entries) on devices with a software keyboard, particularly small screens under 9 inches. The keyboard covers much of the screen and makes searching and nominating more tedious.

> Avoid: Making every attribute searchable on a large roster. It slows search down and makes results less accurate, so test your search thoroughly.

> Avoid: Needless sort options. They confuse participants and can cause display problems on small screens; aim for no more than three.

## Choose what this stage creates

<!-- section: Node setup -->

Pick the **node type** the alters added here will be, for example _Person_. Every node added on this stage is created as that type.

If the type you need does not exist yet, create it here.

<!-- include: node-type -->

## Choose the roster

<!-- section: Roster source -->
<!-- field: dataSource -->

The roster is the network data file this stage lists alters from. Every later roster setting, such as what cards show and what can be searched, is chosen from this file's columns, so choose it first. Once chosen, the editor lists the attributes its entries carry.

Read more about [preparing a roster file](https://documentation.networkcanvas.com/en/design-protocols/tutorials/working-with-rosters#how-to-create-a-roster).

<!-- include: data-file -->

## Write the prompts

<!-- section: Prompt collection -->

A prompt is the question shown above the roster, such as _"Which of your classmates do you spend time with outside school?"_. Add more than one prompt to ask several questions on the same stage; the participant moves through them in order.

Because each roster entry can be added once, an alter added under the first prompt is no longer on the list for the second.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

<!-- include: name-generator-prompts -->

## Title the roster

<!-- section: Roster panel -->
<!-- field: panelTitle -->

The title is shown above the cards, so participants know what the list is. A new stage starts with _Available to add_; change it to say what the list holds, for example _Your classmates_.

## Choose what each card shows

<!-- section: Card display -->
<!-- scene: roster-card-display -->

Every card is titled with the entry's name from the data file. Switch on **Card display** to show more of their attributes beneath it, each with a label, such as their class or department.

Show whatever a participant needs to tell apart entries with similar names.

Read more about [formatting the display of the roster](https://documentation.networkcanvas.com/en/design-protocols/tutorials/working-with-rosters#formatting-the-display-of-the-roster).

## Set the starting order

<!-- section: Roster sorting -->

Switch on **Roster sorting** and add a **Sort rule** to choose the order cards first appear in, such as by surname. Without one, cards keep their order from the data file.

## Let participants sort

<!-- section: Roster sorting -->
<!-- scene: roster-sort -->

**Sortable properties** become buttons above the cards that participants use to re-sort the list themselves, each with the label you give it.

## Let participants search

<!-- section: Roster search -->
<!-- scene: roster-search -->

Switch on **Roster search** to put a search box above the cards. Under **Searchable attributes**, choose which attributes a search looks in. Without this section, there is no search box, and participants find entries by scrolling.

Each attribute you add makes searching a long roster slower, and can make matches less accurate, so choose only the ones participants are likely to search by.

## Choose how closely searches match

<!-- section: Roster search -->

**Search accuracy** sets how close the participant's typing must be to count as a match, from **Exact** to **Low accuracy**. Low accuracy forgives typos and spelling mistakes; higher accuracy narrows results when a roster has many similar names.

As a rule of thumb, the larger the roster, the higher the accuracy should be.

## Limit how many alters can be named

<!-- section: Nomination limits -->
<!-- scene: roster-limits -->

Switch on this section to set a minimum, a maximum, or both. The limits count every alter added on the stage, across all of its prompts.

At the maximum, the cards can no longer be dragged and the participant is told to move on. Under the minimum, they cannot leave the last prompt until they have added enough.

## Customize built-in wording

<!-- section: Customize built-in wording -->

Network Canvas supplies the messages this stage shows. Switch on this section to rewrite them for your study. As well as the minimum and maximum messages, a roster stage has **Everything added**, shown once every card has been added, and **Unnamed label**, the numbered label for an entry with no name. These messages can include the node type's name, so choose a name that reads naturally to participants.

The message shown while an added alter is dragged back to be removed is under **Shared by every stage of this kind**, so changing it changes every roster stage. That part appears once the protocol has a roster stage saved.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
