---
title: Node Labeling
navOrder: 13
---

## How a Node's Label Is Chosen

Every node is shown with a label: on a sociogram, in a name generator's list, in a bin, and wherever a stage's text [pipes in](/en/design-protocols/key-concepts/piped-text) the **Node label**. The interview chooses the label for each node as follows:

1. If the node's type has a [dynamic label](#dynamic-labels), the node shows that label.
2. Otherwise the node shows its default label, taken from the node's own data: an attribute named "name"; otherwise one whose name contains "name"; otherwise, for imported data, a column whose name contains "name" even if the [codebook](/en/design-protocols/key-concepts/codebook) does not list it; otherwise the first text attribute that has a value.
3. A node with none of these is shown as "Unnamed".

If a node shows an unexpected label, check that its type has an attribute named "name", and that the attribute receives a value during the interview.

## Labeling Nodes from Roster Data

To control the labeling of nodes from network file assets, give your nodes an attribute called "name" (regardless of case). You can implement this attribute as a column in your CSV file, or as a named attribute in a GraphML file.

See also: [working with assets](/en/design-protocols/key-concepts/resources#network).

## Dynamic Labels

A dynamic label is a label that you write for a node type yourself. It replaces the default label on every node of that type, and it can change from node to node and during the interview: it can show a node's attributes, and it can show different text depending on those attributes or on the node's place in the network, such as how many edges it has.

Dynamic labels are an advanced feature. Most protocols do not need one, because the default label already shows each node's name.

Dynamic labels work in Interviewer and in [Fresco](/en/collect-data/fresco/about). They are part of the protocol itself, so no extra files are needed.

### Turning On a Dynamic Label

1. In Architect, open the **Codebook** and edit the node type. You can also do this from a stage, when you create a node type or edit the one the stage uses.
2. Switch on **Dynamic label**.
3. Write the label in the **Label** field.
4. Save the node type.

Switching **Dynamic label** off again removes the label you wrote, and the node type goes back to its default label.

### Writing the Label

The label is a single line of text. You can type ordinary text and emoji, and insert two kinds of element with the **Attribute** button in the field's toolbar, or by typing `{`.

**Attributes.** An attribute is shown as a pill: on each node, the label shows that node's own value in its place. You can insert any attribute of the node type, or the **Default label**, which is the label the node would have had without a dynamic label. For example, a label made up of the default label followed by the node's age shows "Alice 34" on one node and "Bo 27" on another. An attribute may have no value for some nodes, and a missing value shows nothing. See [When information is missing](/en/design-protocols/key-concepts/piped-text#when-information-is-missing).

**Dynamic attributes.** A dynamic attribute is a word or phrase that reads differently on different nodes. Choose **Create dynamic attribute** under **Dynamic attributes** in the list, choose its **Logic**, and write each version:

- **If … else** shows one version when rules that you set are met, and another otherwise. **If not … else** is the reverse.
- **Different wording for each answer** shows one version for each answer to a categorical, ordinal or Boolean attribute.
- **Wording for singular or plural numbers** shows a version for each number form, such as "1 child" and "3 children".

A dynamic attribute belongs to the label, so it can be used more than once in the label, and a change to it applies everywhere that it is used in the label. Select its pill to change it. Its versions are plain words. A version can be left empty, and then nothing is shown in place of the pill. See [Dynamic attributes](/en/design-protocols/key-concepts/piped-text#dynamic-attributes).

### Rules

An **If** tests rules about the node that the label is on. Set them under **Rules for “If”** in the dynamic attribute's settings. A rule can test:

- an attribute of the node, such as whether its age is at least 18;
- whether the node has an edge of a given type, or an attribute of one of its edges;
- the number of edges that the node has, of one type or of any type. The number can be compared with a number that you give (exactly, more than, at most, and so on), or with the other nodes of the same type: **Is the highest among nodes of its type** and **Is the lowest among nodes of its type**. Nodes that tie for the highest, or for the lowest, all match. No node matches when every node of the type has the same number of edges.

When an **If** has more than one rule, you choose under **Match** whether all of them or any of them must be met.

**Add else if** adds a further version with rules of its own, which is tested when the versions above it do not apply. The last version, **Otherwise**, is shown when none of the others applies.

For example, to mark the best-connected person on a sociogram, write the default label followed by a dynamic attribute with **If … else**, whose rule is that the number of "knows" edges is the highest among nodes of its type. Make its first version a star emoji, and leave **Otherwise** empty. As the participant draws edges, the star moves to whichever node has the most.

### How Participants See a Dynamic Label

Participants see only the finished label. It is shown wherever the node is drawn, and wherever a stage's text pipes in the node's label. The label is worked out again whenever the node's attributes or edges change, so it stays current as the interview goes on.

A dynamic label changes only what is displayed. It is not stored with the node and is not exported: the node's attributes are exported as usual.

### Translating a Dynamic Label

In a protocol with more than one language, a dynamic label is translated in the [translation table](/en/design-protocols/tutorials/translating-your-protocol#the-translation-table), like any other translatable string that shows values. The logic of its dynamic attributes is the same in every language, and only the wording of each version is translated.

### Protocols That Used a Node Label Worker

Protocols made for older versions of Interviewer could label nodes with a script, `nodeLabelWorker.js`, placed inside the protocol file. Scripts are not run by current versions of Interviewer or by Fresco. Use a dynamic label instead.
