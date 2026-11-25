import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  testId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
  optionCaseKey,
  validateProtocol,
} from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import { submitSection } from '~/protocolBuilder/sectionWrites';
import { getProtocol } from '~/selectors/protocol';

/**
 * Text on a stage chooses its wording by the participant's mood, with a
 * version for each of its options. Deleting an option takes that option's
 * version out of the text in every language, so the protocol stays valid.
 */

const MOOD = testVariableId('mood');
const HAPPY = testId('option/happy');
const SAD = testId('option/sad');
const CALM = testId('option/calm');
const SHOWING_STAGE = '4f2b11a0-3046-11ed-a33e-959cc32d37ee';
const MOOD_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: MOOD,
});

const moodText = (glad: string, blue: string, other: string) =>
  `{${MOOD_NAME}, select, missing {${other}} ${optionCaseKey(HAPPY)} {${glad}} ${optionCaseKey(SAD)} {${blue}} other {${other}}}`;

const OPTIONS = [
  { id: HAPPY, value: 'happy', label: { en: 'Happy', es: 'Feliz' } },
  { id: SAD, value: 'sad', label: { en: 'Sad', es: 'Triste' } },
  { id: CALM, value: 'calm', label: { en: 'Calm', es: 'Tranquilo' } },
];

const makeStore = () => {
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
      [MOOD]: {
        name: 'mood',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: OPTIONS,
      },
    },
  };
  protocol.stages = protocol.stages.map((stage) =>
    stage.id === SHOWING_STAGE && stage.type === 'Information'
      ? {
          ...stage,
          content: {
            en: moodText('Glad.', 'Sorry.', 'Hello.'),
            es: moodText('Qué bien.', 'Lo siento.', 'Hola.'),
          },
        }
      : stage,
  );
  store.dispatch(protocolActions.setActiveProtocol(protocol));
  return store;
};

const shownText = (store: ReturnType<typeof makeStore>) => {
  const stage = getProtocol(store.getState())?.stages.find(
    (each) => each.id === SHOWING_STAGE,
  );
  return stage?.type === 'Information' ? stage.content : undefined;
};

const ONLY_HAPPY = (other: string, glad: string) =>
  `{${MOOD_NAME}, select, missing {${other}} ${optionCaseKey(HAPPY)} {${glad}} other {${other}}}`;

describe('deleting an option that text has a version for', () => {
  it('starts from a protocol that validates', async () => {
    const protocol = getProtocol(makeStore().getState());
    expect((await validateProtocol(protocol)).success).toBe(true);
  });

  it('takes the version out of every language when the codebook editor saves', async () => {
    const store = makeStore();
    const ego = getProtocol(store.getState())?.codebook.ego;
    if (ego === undefined) throw new Error('No ego');

    const written = await submitSection(
      store,
      { kind: 'codebookEgo' },
      {
        ...ego,
        variables: {
          ...ego.variables,
          [MOOD]: {
            ...ego.variables?.[MOOD],
            options: OPTIONS.filter((option) => option.id !== SAD),
          },
        },
      },
    );

    expect(written).toMatchObject({ status: 'written' });
    expect(shownText(store)).toEqual({
      en: ONLY_HAPPY('Hello.', 'Glad.'),
      es: ONLY_HAPPY('Hola.', 'Qué bien.'),
    });
    expect(
      (await validateProtocol(getProtocol(store.getState()))).success,
    ).toBe(true);
  });

  it('takes the version out when the variable is updated on its own', async () => {
    const store = makeStore();

    await store.dispatch(
      updateVariableByUUID(
        MOOD,
        { options: OPTIONS.filter((option) => option.id !== SAD) },
        ['options'],
      ),
    );

    expect(shownText(store)).toEqual({
      en: ONLY_HAPPY('Hello.', 'Glad.'),
      es: ONLY_HAPPY('Hola.', 'Qué bien.'),
    });
    expect(
      (await validateProtocol(getProtocol(store.getState()))).success,
    ).toBe(true);
  });

  it('leaves the text alone when an option is relabelled', async () => {
    const store = makeStore();

    await store.dispatch(
      updateVariableByUUID(
        MOOD,
        {
          options: OPTIONS.map((option) =>
            option.id === SAD
              ? { ...option, label: { en: 'Low', es: 'Bajo' } }
              : option,
          ),
        },
        ['options'],
      ),
    );

    expect(shownText(store)).toEqual({
      en: moodText('Glad.', 'Sorry.', 'Hello.'),
      es: moodText('Qué bien.', 'Lo siento.', 'Hola.'),
    });
  });

  it('leaves the text of a protocol being opened as it was stored', () => {
    const store = makeStore();
    const opened = structuredClone(
      getProtocol(store.getState()),
    ) as CurrentProtocol;
    const mood = opened.codebook.ego?.variables?.[MOOD];
    if (mood?.type !== 'categorical') throw new Error('No mood');
    mood.options = OPTIONS.filter((option) => option.id !== SAD);

    store.dispatch(protocolActions.setActiveProtocol(opened));

    // Another protocol, not a change to the one open before it.
    expect(shownText(store)).toEqual({
      en: moodText('Glad.', 'Sorry.', 'Hello.'),
      es: moodText('Qué bien.', 'Lo siento.', 'Hola.'),
    });
  });
});
