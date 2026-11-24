import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import { getIsUsed } from '~/selectors/codebook/isUsed';
import { getProtocol } from '~/selectors/protocol';
import {
  templateTypeId,
  templateVariableId,
} from '~/templates/__tests__/templateCodebookIds';
import { developmentProtocol } from '~/templates/development-protocol';

/**
 * Regression coverage for #1392's silent no-op: `deleteVariableAsync` used to
 * `return false` when the variable was in use. A resolved thunk reads as
 * success everywhere — `useDialog().confirm` closes its dialog and reports the
 * deletion done — so the researcher was told a variable had gone while it was
 * still in the codebook.
 */

const PERSON = templateTypeId(developmentProtocol, 'node', 'person');
// person.last_name, referenced by prompt sort keys only. Before the usage-index
// fix it read as in-use with nothing to show for it; it is still in use, and
// deleting it must still be refused — out loud.
const LAST_NAME = templateVariableId(
  developmentProtocol,
  { entity: 'node', typeName: 'person' },
  'last_name',
);
// person.talk_friend, referenced nowhere in the development protocol.
const UNUSED = templateVariableId(
  developmentProtocol,
  { entity: 'node', typeName: 'person' },
  'talk_friend',
);

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(
    protocolActions.setActiveProtocol(structuredClone(developmentProtocol)),
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
