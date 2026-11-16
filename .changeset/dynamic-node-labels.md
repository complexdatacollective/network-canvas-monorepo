---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

A node type can label its own nodes. The node type editor in Architect has a new Dynamic label section, switched on with a toggle, where a researcher writes the label shown on every node of the type, in place of the label the interview chooses on its own. The label is written in the piped text editor: text and emoji, with values inserted from the syringe button or by typing `{`. It can show the node's attributes and the label the interview would otherwise have chosen ("Default label"), and it can change by case:

- by the answer to a categorical, ordinal or yes/no attribute, with one version of the text for each answer (a hospital shows 🏥, a school 🏫), by whether an attribute is known, and by a number's plural form;
- by how the node is connected: whether it has any edge, or an edge of one type, and whether it has the most or the fewest edges (of any type, or of one type) among the nodes of its type. Nodes that tie share the place, and no node is marked while every node of the type has the same number;
- by conditions the researcher defines for the node type, each a named set of rules built with the rule builder that filters and skip logic use (an attribute compared with a value, an edge of a type, all or any of several rules).

A version can hold further versions, so cases combine. Encrypted attributes are not offered; a label can still show an encrypted name through the default label.

Interviewer and Fresco show the label wherever they draw a node, and wherever a prompt or form pipes a node's label. It is read live: it follows the node's answers and its edges as they change, in the participant's language. A label that comes out empty leaves the node with the label the interview would have chosen. Each node is redrawn only when its own label changes: an edge added elsewhere in the network redraws nothing else.

- `@codaco/protocol-validation`: schema 9 node types take an optional `dynamicLabel` (`text`, `dynamicValues`, `conditions`). Bindings there may name `node.<id>`, `node.$label`, `node.$connected`, `node.$mostConnected` and `node.$leastConnected` (each optionally followed by `.<edge type>`), and `node.$condition.<id>`. New exports: `NodeLabelSchema`, `NodeLabelConditionSchema`, `nodeLabelValueContext`, `findNodeLabelProblems`, `dynamicValueConnectivityPathFor`, `dynamicValueConditionPathFor`, `CONNECTIVITY_MEASURES` and `TRUE_CASE`. `DynamicValueSite` gains `nodeLabel`. A label's bindings count as uses of the attributes and edge types they name.
- The new Architect text is in English only for now.
