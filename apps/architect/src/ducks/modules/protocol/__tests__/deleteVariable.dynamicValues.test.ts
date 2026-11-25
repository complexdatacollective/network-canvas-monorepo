import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { testVariableId } from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
} from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { getEntityProperties } from '~/components/Codebook/helpers';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import { getIsUsed } from '~/selectors/codebook/isUsed';
import { getVariableUsageHits } from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';

/**
 * A piped text is the only thing that uses the participant's `nickname` here:
 * no form collects it and no rule reads it. Deleting it would leave the text
 * with nothing to show, so it is in use, and the researcher must be told which
 * stage uses it.
 */

const NICKNAME = testVariableId('nickname');
// The name text uses for it: its id, with the hyphens written as underscores.
const YOU = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: NICKNAME,
});
const SHOWING_STAGE = '4f2b11a0-3046-11ed-a33e-959cc32d37ee';
const SHOWING_STAGE_LABEL = 'Ego name contains';

const SHOWS_NICKNAME = {
  en: `{${YOU}, select, missing {Tell us about them.} other {Tell us about {${YOU}}.}}`,
  es: `{${YOU}, select, missing {Cuéntanos sobre ellos.} other {Cuéntanos sobre {${YOU}}.}}`,
};

const makeStore = ({ shown }: { shown: boolean }) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  const protocol = structuredClone(
    developmentProtocol,
  ) as unknown as CurrentProtocol;
  protocol.codebook.ego = {
    ...protocol.codebook.ego,
    variables: {
      ...protocol.codebook.ego?.variables,
      [NICKNAME]: { name: 'nickname', type: 'text' },
    },
  };
  protocol.stages = protocol.stages.map((stage) =>
    shown && stage.id === SHOWING_STAGE && stage.type === 'Information'
      ? { ...stage, content: SHOWS_NICKNAME }
      : stage,
  );
  store.dispatch(protocolActions.setActiveProtocol(protocol));
  return store;
};

const egoVariables = (store: ReturnType<typeof makeStore>) =>
  getProtocol(store.getState())?.codebook.ego?.variables ?? {};

describe('a variable used only by a stage’s dynamic value', () => {
  it('is in use, and the usage names the stage that shows it', () => {
    const store = makeStore({ shown: true });
    const state = store.getState();

    expect(getIsUsed(state)[NICKNAME]).toBe(true);
    const stageIndex = getProtocol(state)?.stages.findIndex(
      (stage) => stage.id === SHOWING_STAGE,
    );
    expect(
      getVariableUsageHits(state, NICKNAME).map((hit) => hit.path),
    ).toEqual([
      ['stages', stageIndex, 'content', 'en'],
      ['stages', stageIndex, 'content', 'es'],
    ]);
    expect(
      getEntityProperties(state, { entity: 'ego' })?.variables[NICKNAME]?.usage,
    ).toEqual([{ label: SHOWING_STAGE_LABEL, id: SHOWING_STAGE }]);
  });

  it('cannot be deleted', async () => {
    const store = makeStore({ shown: true });

    await expect(
      store
        .dispatch(deleteVariableAsync({ entity: 'ego', variable: NICKNAME }))
        .unwrap(),
    ).rejects.toThrow(/in use and cannot be deleted/);

    expect(egoVariables(store)).toHaveProperty(NICKNAME);
  });

  it('is deleted once no text shows it', async () => {
    const store = makeStore({ shown: false });
    expect(getIsUsed(store.getState())[NICKNAME]).toBe(false);

    await store
      .dispatch(deleteVariableAsync({ entity: 'ego', variable: NICKNAME }))
      .unwrap();

    expect(egoVariables(store)).not.toHaveProperty(NICKNAME);
  });
});
