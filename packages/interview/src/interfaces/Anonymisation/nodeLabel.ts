import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import {
  type EncryptedValue,
  getEncryptedValue,
  type OutcomeOf,
} from './decryptionScope';

const LOCKED_LABEL = '🔒';
const FAILED_LABEL = '⚠️';

/**
 * What a node is labelled with: the text of the attribute chosen as its label
 * (`undefined` when it has none to show), or that attribute's stored
 * ciphertext.
 */
type NodeLabelSource =
  | { status: 'plain'; text: string | undefined }
  | { status: 'encrypted'; value: EncryptedValue };

export function readNodeLabelSource(
  node: NcNode,
  variables: Record<string, Variable>,
  encryptionEnabled: boolean,
): NodeLabelSource {
  const attributes = node[entityAttributesProperty];
  const attribute = getNodeLabelAttribute(variables, attributes);
  if (!attribute) return { status: 'plain', text: undefined };

  const encrypted = getEncryptedValue(
    node,
    attribute,
    variables,
    encryptionEnabled,
  );
  if (encrypted) return { status: 'encrypted', value: encrypted };

  // getNodeLabelAttribute only nominates text/number-valued attributes;
  // anything else (stale codebook, ciphertext arrays) falls back.
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
  /** The name of the node's type, which a node with no text of its own shows. */
  typeLabel: string | undefined;
  outcomeOf: OutcomeOf;
};

/**
 * The label `node` shows, read from its `source`: the plaintext of an
 * encrypted answer once it has decrypted, the lock while it is locked or still
 * decrypting, and the warning when it could not be decrypted. A node with no
 * text shows its type's name, or its id when its type has none.
 */
export function nodeLabelText(
  node: NcNode,
  source: NodeLabelSource,
  { typeLabel, outcomeOf }: NodeLabelTextOptions,
): string {
  if (source.status === 'plain') {
    return source.text ?? typeLabel ?? node[entityPrimaryKeyProperty];
  }

  const outcome = outcomeOf(source.value);
  if (!outcome) return LOCKED_LABEL;
  return outcome.readable ? outcome.plaintext : FAILED_LABEL;
}
