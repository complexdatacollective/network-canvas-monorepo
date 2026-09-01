import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import { getIsUsed } from '~/selectors/codebook/isUsed';
import { getProtocol } from '~/selectors/protocol';

/**
 * Regression coverage for #1392's silent no-op: `deleteVariableAsync` used to
 * `return false` when the variable was in use. A resolved thunk reads as
 * success everywhere — `useDialog().confirm` closes its dialog and reports the
 * deletion done — so the researcher was told a variable had gone while it was
 * still in the codebook.
 */

const PERSON = 'person_node_type';
// person.last_name, referenced by prompt sort keys only. Before the usage-index
// fix it read as in-use with nothing to show for it; it is still in use, and
// deleting it must still be refused — out loud.
const LAST_NAME = '0ff25001-a2b8-46de-82a9-53143aa00d10';
// person.talk_friend, referenced nowhere in the development protocol.
const UNUSED = 'd2d8091e-8170-42c1-9dc0-c0d54553b3e6';

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(
    protocolActions.setActiveProtocol(
      structuredClone(developmentProtocol) as unknown as CurrentProtocol,
    ),
  );

  return store;
};

const personVariables = (store: ReturnType<typeof makeStore>) =>
  getProtocol(store.getState())?.codebook.node?.[PERSON]?.variables ?? {};

describe('deleteVariableAsync', () => {
  it('rejects rather than resolving when the variable is in use', async () => {
    const store = makeStore();
    expect(getIsUsed(store.getState())[LAST_NAME]).toBe(true);

    await expect(
      store
        .dispatch(
          deleteVariableAsync({
            entity: 'node',
            type: PERSON,
            variable: LAST_NAME,
          }),
        )
        .unwrap(),
    ).rejects.toThrow(/in use and cannot be deleted/);

    expect(personVariables(store)).toHaveProperty(LAST_NAME);
  });

  it('deletes an unused variable and resolves', async () => {
    const store = makeStore();
    expect(personVariables(store)).toHaveProperty(UNUSED);
    expect(getIsUsed(store.getState())[UNUSED]).toBe(false);

    await store
      .dispatch(
        deleteVariableAsync({ entity: 'node', type: PERSON, variable: UNUSED }),
      )
      .unwrap();

    expect(personVariables(store)).not.toHaveProperty(UNUSED);
  });
});
