<!--
  Shared step for the node type section, on every stage type that works with
  nodes already in the network. Include with the line "include: node-type" in
  an HTML comment.
-->

## Choose the node type

<!-- section: node-type -->

Choose the **node type** this stage works with, such as _Person_. The stage uses the nodes of that type already in the participant's network, so an earlier stage, such as a name generator, has to create them.

If the type you need does not exist yet, you can create it here. Then add a stage before this one that creates nodes of that type.

Changing the node type later clears this stage's other settings, because they depend on the node type.
