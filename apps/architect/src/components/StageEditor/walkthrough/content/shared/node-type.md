<!--
  Shared step for the node type section, on every stage type that has it.
  Include with the line "include: node-type" in an HTML comment.
-->

## Choose the node type

<!-- section: node-type -->

Choose the **node type** this stage works with. If the stage creates alters, each one is saved as a node of this type. If it asks about or shows alters, it uses the nodes of this type already in the interview network, so an earlier stage has to create them.

If the type you need does not exist yet, you can create it here.

Changing the node type later clears this stage's other settings, because they depend on the node type.

Some stages, such as the Sociogram and the Narrative, can show more than one node type. On those stages, select each type that the stage shows. Adding a type keeps the stage's settings. Removing a type removes only the settings for that type, such as a prompt's highlight attribute and sort rules or a preset's highlight attributes, and Architect asks before it removes them.

You cannot remove a type while a prompt highlights nodes of that type only, or while a prompt creates an edge type that cannot connect the types that remain. Change or delete those prompts first. If you remove the last type, Architect asks first, because the stage then has no node type and its other settings are cleared.
