---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/protocol-utilities': minor
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Piped text can contain logic, and a node type can label its own nodes with it.

**Logic in piped text.** Text that pipes values can choose between versions with logic:

- **If … else** and **If not … else**: text shown when rules are met, and text shown otherwise. The rules are set in the rule builder that filters and skip logic use. An If can take further **else if** cases, each with rules of its own, and cases can be removed.
- **Different wording for each answer** to a categorical, ordinal or yes/no attribute, wording for singular or plural numbers, and wording for the participant or someone else.

The rules of an If are asked where the text is shown. They can compare the participant's attributes; in text shown with a node or an edge (a form about it, a pair in a census, a node being placed) they can also compare that entity's attributes, and for a node ask about its edges: whether it has an edge of a type, an attribute of one, or how many it has. A count can be compared with a number, or be the highest or the lowest among the nodes of the type (nodes that tie all match, and none does while every node has the same count). Text shown with two nodes asks which of them the rules are about.

Logic is drawn in a colour and with an icon of its own, so it can be told from a value.

**Dynamic node labels.** The node type editor in Architect has a new Dynamic label section, switched on with a toggle, where a researcher writes the label shown on every node of the type, in place of the label the interview chooses on its own. It is written in the same editor: text and emoji, the node's attributes, the label the interview would otherwise have chosen ("Default label"), and dynamic attributes whose logic tests the node, including its edges. Encrypted attributes are not offered; a label can still show an encrypted name through the default label.

Interviewer and Fresco show the label wherever they draw a node, and wherever a prompt or form pipes a node's label. Labels and stage text follow the answers and edges they test as they change, in the participant's language. A label that comes out empty leaves the node with the label the interview would have chosen. Each node is redrawn only when its own label changes: an edge added elsewhere in the network redraws nothing else.

- `@codaco/protocol-validation`: schema 9 stages take an optional `conditions`, and node types an optional `dynamicLabel` (`text`, `conditions`). `conditions` are keyed by UUID (`createConditionId`). A condition is `{ about?, join?, rules }`, whose rules are filter rules or the new edge-count rule (`{ type: 'edge', options: { type?, count, value? } }`). A message chooses its wording by one as `{condition_<id>, select, true {…} false {…} other {…}}`, with each `-` of the id written as `_`. `DynamicValueSite` gains `nodeLabel`. New exports include `ConditionSchema`, `ConditionsSchema`, `EdgeCountComparisons`, `isEdgeCountRule`, `conditionsContextOf`, `NodeLabelSchema`, `nodeLabelValueContext`, `findNodeLabelProblems`, `createConditionId`, `TRUE_CASE` and `FALSE_CASE`.
- `@codaco/fresco-ui`: `RichTextEditor` takes an `onVersionsAction` handler; an insert menu item can `request` its content before it is inserted; a set of versions can be drawn as logic (`variant`), carry actions of its own and on each version, and shows a preview of its versions while folded.
