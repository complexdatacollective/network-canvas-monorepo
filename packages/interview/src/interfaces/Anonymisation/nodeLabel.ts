import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import {
  type OutcomeOf,
  readEncryptedAttribute,
  type StoredEncryptedAttribute,
} from './decryptionScope';

const LOCKED_LABEL = '🔒';

/**
 * What a node is labelled with: the text of the attribute chosen as its label
 * (`undefined` when it has none to show), or that attribute's stored
 * ciphertext.
 */
type NodeLabelSource =
  | { status: 'plain'; text: string | undefined }
  | StoredEncryptedAttribute;

export function readNodeLabelSource(
  node: NcNode,
  variables: Record<string, Variable>,
): NodeLabelSource {
  const attributes = node[entityAttributesProperty];

  // The variables as this node stores them: one whose value its record says is
  // encrypted counts as encrypted when choosing the label, as when reading it,
  // so a name stored encrypted under a variable the codebook no longer
  // encrypts is still decrypted and shown as the name.
  const labelVariables = Object.fromEntries(
    Object.entries(variables).map(([variableId, variable]) => [
      variableId,
      !variable.encrypted && readEncryptedAttribute(node, variableId, variables)
        ? { ...variable, encrypted: true }
        : variable,
    ]),
  );
  const attribute = getNodeLabelAttribute(labelVariables, attributes);
  if (!attribute) return { status: 'plain', text: undefined };

  const stored = readEncryptedAttribute(node, attribute, variables);
  if (stored) return stored;

  // getNodeLabelAttribute only nominates text/number-valued attributes;
  // anything else (a stale codebook) falls back.
  const value = attributes[attribute];
  return {
    status: 'plain',
    text:
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : undefined,
  };
}

type NodeLabelTextOptions = {
  /** The label of the node's type, which a node with no text of its own shows. */
  typeLabel: string;
  /** The label of an answer that can never be read. */
  unavailable: string;
  outcomeOf: OutcomeOf;
  /** Whether the interview's encryption header is refused, so no key exists. */
  encryptionUnavailable: boolean;
};

/**
 * The label `node` shows, read from its `source`: the plaintext of an
 * encrypted answer once it has decrypted readable, and never anything derived
 * from it otherwise, so the lock while it is locked or still decrypting. A
 * node with no text shows its type's label, or its id when that is blank.
 */
export function nodeLabelText(
  node: NcNode,
  source: NodeLabelSource,
  {
    typeLabel,
    unavailable,
    outcomeOf,
    encryptionUnavailable,
  }: NodeLabelTextOptions,
): string {
  if (source.status === 'plain') {
    if (source.text !== undefined) return source.text;
    return typeLabel.trim() === '' ? node[entityPrimaryKeyProperty] : typeLabel;
  }
  if (source.status === 'unreadable' || encryptionUnavailable) {
    return unavailable;
  }

  const outcome = outcomeOf(source.value);
  if (!outcome) return LOCKED_LABEL;
  return outcome.readable ? outcome.plaintext : unavailable;
}
