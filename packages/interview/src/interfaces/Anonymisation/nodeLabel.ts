import type { Variable } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import {
  type DecryptionScope,
  readCachedOutcome,
  readEncryptedAttribute,
  type StoredEncryptedAttribute,
} from './decryptionScope';

export const LOCKED_LABEL = '🔒';

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
  /** The label of a node with no text to show. */
  fallback: string;
  /** The label of an answer that can never be read. */
  unavailable: string;
  scope: DecryptionScope | undefined;
  /** Whether the interview's encryption header is refused, so no key exists. */
  encryptionUnavailable: boolean;
};

/**
 * The label read from `source`: the plaintext of an encrypted answer once
 * `scope` has decrypted it, and never anything derived from it otherwise.
 * `undefined` while the answer is still being decrypted.
 */
export function nodeLabelText(
  source: NodeLabelSource,
  { fallback, unavailable, scope, encryptionUnavailable }: NodeLabelTextOptions,
): string | undefined {
  if (source.status === 'plain') return source.text ?? fallback;
  if (source.status === 'unreadable' || encryptionUnavailable) {
    return unavailable;
  }
  if (!scope) return LOCKED_LABEL;

  const outcome = readCachedOutcome(scope, source.value);
  if (!outcome) return undefined;
  return outcome.readable ? outcome.plaintext : unavailable;
}
