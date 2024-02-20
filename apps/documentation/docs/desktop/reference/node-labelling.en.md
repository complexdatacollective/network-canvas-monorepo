---
title: Node Labelling
---

## How Interviewer Calculates a Node's Label

Interviewer calculates the label to be used when rendering a node using the the following logic:

0. Use any node label worker that is within the protocol (see [section below](#custom-node-labelling-advanced) for details on this advanced feature).
1. Look for a variable called "name" (regardless of case) in the [codebook](/en/desktop/key-concepts/codebook) for node's type, and try to retrieve this value from the node.
2. Look for a property on the node with a key of 'name' (regardless of case), and try to retrieve this value.
3. Show the text "No 'name' variable!"

If you are seeing unexpected results, such as "No 'name' variable!" messages, ensure you have constructed your protocol or your data in a way that satisfies a rule with a higher precedence. For example, ensure you have correctly created a 'name' variable for the node type, and that this variable is assigned a value within your interview.

For advanced functionality, such as calculating a node label dynamically, see ["custom node labelling"](#custom-node-labelling-advanced).

## Labelling Nodes from Roster Data

To control the labelling of nodes from network file assets, the following options are available: create an attribute for your nodes called "name" (regardless of case). You can implement this attribute as a column in your CSV file, or as a named attribute in a GraphML file.

See also: [working with assets](/en/desktop/key-concepts/resources#network).

## Custom Node Labelling (Advanced)

For more flexible labelling of nodes, you can implement a custom labelling function. To accomplish this, you would:

- Add `nodeLabelWorker.js` to your protocol (see: [the protocol file format](/en/desktop/reference/protocol-file-format) for details of how to do this)
- Within this file, define a function named `nodeLabelWorker`
- Return a string from that function, which will be used as the label.

`nodeLabelWorker` is called with an object containing information about the node and network, and should return the label (a string) for the given node. Conceptually: `f(node, network) -> label`. Thus you can update labels for nodes based on the changing state of the network, or an individual node's attributes.

Here's a simple example which will label every node with a compound property (initial + surname):

```javascript
/**
 * @param  {Object} data
 * @param  {Object} data.node All props for the node requiring a label
 * @param  {string} data.node.networkCanvasId Unique ID for the node. Note that if your data
 *                                            happens to already contain a property named
 *                                            "networkCanvasId", your prop will take precedence,
 *                                            and this cannot be used to identify edge connections.
 * @param  {Object} data.network The current state of the network in this session
 * @param  {Array} data.network.nodes Each node has a unique `networkCanvasId` prop
 * @param  {Array} data.network.edges Edges contain `to` and `from` props which
 *                                    correspond to nodes' `networkCanvasId` values
 *
 * @return {string|Promise} a label for the input node, or
 *                          a promise that resolves to the label
 */
function nodeLabelWorker({ node, network }) {
  return `${node.first_name[0]} ${node.last_name}`;
}
```

In addition to attributes specified from a protocol, each node will contain a unique `networkCanvasId` property which can be used to identify the node in the network.

The `nodeLabelWorker` function will be executed asynchronously in a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) environment. It will be further restricted by the Content Security Policy of the app; you should not rely on network access within the labelling function.

For a more complete example, see [the nodeLabelWorker in the development protocol](https://github.com/complexdatacollective/development-protocol/blob/master/nodeLabelWorker.js).
