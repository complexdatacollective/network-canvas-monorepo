import {
  type MessageNode,
  messageStructure,
} from '@codaco/protocol-validation';

export type MessageSwitchSummary = {
  argument: string;
  type: 'select' | 'plural';
  /** The case or plural category of each version, in the message's order. */
  keys: string[];
};

/**
 * Every select and plural in a stored ICU message, outermost first, read with
 * the parser the app itself uses. A message the parser cannot read throws, so
 * a spec asserting on switches never passes over text it could not understand.
 */
export function switchesIn(message: string): MessageSwitchSummary[] {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) {
    throw new Error(`${structure.kind} message: ${message}`);
  }
  const found: MessageSwitchSummary[] = [];
  const walk = (nodes: readonly MessageNode[]) => {
    for (const node of nodes) {
      if (node.kind !== 'switch') continue;
      found.push({
        argument: node.argument,
        type: node.type,
        keys: node.versions.map(({ key }) => key),
      });
      for (const version of node.versions) walk(version.nodes);
    }
  };
  walk(structure.nodes);
  return found;
}
