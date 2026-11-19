<!--
  Shared step for the Filter network section, on every stage type that has
  it. Include with the line "include: filter-network" in an HTML comment.
-->

## Filter network

<!-- section: filter-network -->
<!-- scene: stage-filter -->

Switch on **Filter network** to include only part of the network on this stage, for example only the nodes whose `close_friend` attribute is true. Without a filter, everything of the chosen type appears.

Filtering happens before the stage works out what to show, so an edge is also removed when the filter removes the node at either end of it.

Read more about [network filtering](https://documentation.networkcanvas.com/design-protocols/key-concepts/network-filtering).
