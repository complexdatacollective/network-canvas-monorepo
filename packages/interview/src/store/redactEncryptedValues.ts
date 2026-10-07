import { Immer, isDraft } from 'immer';

import { entitySecureAttributesMeta } from '@codaco/shared-consts';

import type { ProtocolPayload } from '../contract/types';

const REDACTED_VALUE = '[encrypted]';

// Unfrozen, because a copy shares what it does not change with the action or
// state it was made from, and their owners may still change those.
const immer = new Immer({ autoFreeze: false });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Replaces every value held under the id of an encrypted variable, wherever
 * it sits within `draft`. Only drafts are walked, so nothing outside the copy
 * is ever changed. What an entity records about how its values were encrypted
 * holds no answer, and is kept.
 */
function redactWithin(draft: unknown, encrypted: ReadonlySet<string>): void {
  if (!isDraft(draft)) return;
  if (Array.isArray(draft)) {
    for (const item of draft) redactWithin(item, encrypted);
    return;
  }
  if (!isRecord(draft)) return;
  for (const [key, value] of Object.entries(draft)) {
    if (key === entitySecureAttributesMeta) continue;
    if (!encrypted.has(key)) {
      redactWithin(value, encrypted);
    } else if (
      value !== null &&
      value !== undefined &&
      value !== REDACTED_VALUE
    ) {
      draft[key] = REDACTED_VALUE;
    }
  }
}

export type EncryptedValueRedaction = {
  action: <A>(action: A) => A;
  state: <S>(state: S) => S;
};

/**
 * Copies of actions and of the store's state that show no value of a
 * variable `codebook` encrypts, for development tools to display. An answer
 * is in the clear in the action that writes it, before it is encrypted, and a
 * value stored without encryption stays in the clear in the state.
 *
 * Values are matched by variable id alone: an action that updates a node does
 * not say its type, so a variable another type encrypts is hidden too. The
 * state is only searched within the session, because the codebook lists its
 * variables under the same ids.
 */
export function createEncryptedValueRedaction(
  codebook: ProtocolPayload['codebook'],
): EncryptedValueRedaction {
  const encrypted = new Set(
    Object.values(codebook.node ?? {}).flatMap(({ variables }) =>
      Object.entries(variables ?? {})
        .filter(([, variable]) => variable.encrypted)
        .map(([variableId]) => variableId),
    ),
  );

  return {
    action: (action) =>
      immer.produce(action, (draft) => {
        redactWithin(draft, encrypted);
      }),
    state: (state) =>
      immer.produce(state, (draft) => {
        if (isRecord(draft)) redactWithin(draft.session, encrypted);
      }),
  };
}
