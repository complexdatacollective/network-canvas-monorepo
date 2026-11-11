<!--
  Shared steps for a name generator's Side panels section and its panel
  window. Include with the line "include: side-panels" in an HTML comment.
-->

## Offer nodes from elsewhere

<!-- section: Side panels -->
<!-- scene: name-generator-panel-sources -->

A side panel lists nodes beside the question, so the participant can drag them in instead of typing them again. Each panel takes its nodes from one of two sources:

- **The interview so far**: alters already named on earlier stages or prompts. Use this when several prompts may name the same alters, so that the participant can add an existing alter to another prompt without creating a duplicate.
- **A network data file**: a roster you import, such as the members of a class or team. Every participant sees the same list.

A stage can have up to two panels, for example one listing alters already named and one listing a roster.

Read more about [working with roster data](https://documentation.networkcanvas.com/en/design-protocols/tutorials/working-with-rosters).

## Name the panel

<!-- dialog: create panel | edit panel -->
<!-- field: title -->

The title appears at the top of the panel in the interview, for example _People you've already named_ or _Your classmates_. Use it to say what the list contains, so the participant knows why it is there.

## Choose where the nodes come from

<!-- dialog: create panel | edit panel -->
<!-- field: dataSource -->
<!-- scene: name-generator-panel-sources -->

**Use the network from the in-progress interview** lists the nodes of this type that are already in the participant's network, leaving out any that are already on this prompt. Dragging one of these nodes in adds it to this prompt rather than creating a new node.

**Use a network data file** lists the rows of a roster you import as a CSV or JSON file. Dragging a row in creates a node and removes the row from the list, so each roster entry can be added only once.

## Filter what appears

<!-- dialog: create panel | edit panel -->
<!-- scene: name-generator-filter -->

Switch on **Panel filter** to show only some of the nodes, for example only nodes whose `close_friend` attribute is true, or only roster rows for one class. The filter applies to every prompt of this stage. Without a filter, the panel shows every node in its source that isn't already on this prompt.

Read more about [network filtering](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/network-filtering).
