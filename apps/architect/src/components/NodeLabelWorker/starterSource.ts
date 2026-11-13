/**
 * What a new node label worker starts as. The comments are JavaScript, read
 * by someone writing JavaScript, so they are not translated.
 */
export const STARTER_SOURCE = `// Runs once for every node. Return the text to show as the node's label.
//
// node     The node's attributes, by variable name, with two more properties:
//          networkCanvasId and networkCanvasType (the name of its node type).
// network  { nodes, edges, ego }. Each edge has "from" and "to": the
//          networkCanvasId of the two nodes it joins.
function nodeLabelWorker({ node, network }) {
  return node.name;
}
`;
