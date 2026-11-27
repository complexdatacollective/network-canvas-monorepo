import { describe, expect, it } from 'vitest';

import {
  dynamicValueNameFor,
  optionCaseKey,
} from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { informationStageEditor } from '../../editors/information/InformationStageEditor.ts';
import {
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testId, testVariableId } from '../../testing/testId.ts';

const MOOD_ID = testVariableId('mood');
const HAPPY = testId('option/happy');
const SAD = testId('option/sad');
const MOOD = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: MOOD_ID,
});

const FEELING = testId('dynamic/feeling');
const FEELING_NAME = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: FEELING,
});

const ENGLISH_AND_SPANISH = {
  defaultLocale: 'en-US',
  locales: ['en-US', 'es'],
};

/** A participant's mood: happy or sad. */
const egoWithMood = () => {
  const ego = fixtureProtocolSections()[sectionId({ kind: 'codebookEgo' })];
  const variables =
    typeof ego?.variables === 'object' && ego.variables !== null
      ? ego.variables
      : {};
  return {
    ...ego,
    variables: {
      ...variables,
      [MOOD_ID]: {
        name: 'mood',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { id: HAPPY, value: 'happy', label: { 'en-US': 'Happy' } },
          { id: SAD, value: 'sad', label: { 'en-US': 'Sad' } },
        ],
      },
    },
  };
};

/**
 * An Information stage whose text shows a dynamic attribute with a version
 * for each answer to the participant's mood, one of them for `answerOption`.
 */
const openWithAnswer = async (
  answerOption: string,
  wordings: Readonly<{
    other?: Readonly<Record<string, string>>;
  }> = {},
) => {
  const { type, fields } = loadFixtureStage('information-1');
  const harness = renderStageEditor({
    stage: {
      type,
      fields: {
        ...fields,
        content: { 'en-US': `You seem {${FEELING_NAME}} today.` },
        dynamicAttributes: {
          [FEELING]: {
            logic: 'answers',
            value: MOOD,
            missing: { 'en-US': 'fine' },
            answers: [
              {
                answer: optionCaseKey(answerOption),
                wording: { 'en-US': 'cheerful' },
              },
            ],
            other: wordings.other ?? { 'en-US': 'well' },
          },
        },
      },
    },
    registry: informationStageEditor,
    localization: ENGLISH_AND_SPANISH,
  });
  harness.receiveCodebookUpdate({ ego: egoWithMood() });
  await harness.opened();
  return harness;
};

describe('a dynamic attribute whose version the schema refuses', () => {
  it('names the dynamic attribute and the version when the version has no wording', async () => {
    const harness = await openWithAnswer(HAPPY, { other: {} });

    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([
      'Dynamic attribute “fine / cheerful”, version “Any other answer”: Write this version.',
    ]);
  });

  it('names the dynamic attribute and the version when the wording chooses between versions inside its sentence', async () => {
    const harness = await openWithAnswer(HAPPY, {
      other: { 'en-US': 'you {sic, select, a {b} other {c}}' },
    });

    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([
      expect.stringMatching(
        /^Dynamic attribute “fine \/ cheerful.*”, version “Any other answer”: This wording chooses between versions inside a sentence/,
      ),
    ]);
  });
});

describe('a dynamic attribute with a version for an answer that its attribute does not have', () => {
  it('refuses the save with a problem that names the dynamic attribute', async () => {
    const harness = await openWithAnswer(testId('option/deleted'));

    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([
      'Dynamic attribute “fine / cheerful / well”, version “Deleted option”: This version is for an answer that the attribute does not have.',
    ]);
  });

  it('names the dynamic attribute in the language being edited, not in the first language that it is stored in', async () => {
    const harness = await openWithAnswer(testId('option/deleted'), {
      other: { 'es': 'bien', 'en-US': 'well' },
    });

    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([
      'Dynamic attribute “fine / cheerful / well”, version “Deleted option”: This version is for an answer that the attribute does not have.',
    ]);
  });

  it('is saved when each of its answers is one that the attribute has', async () => {
    const harness = await openWithAnswer(HAPPY);

    expect(await harness.submit()).not.toBeNull();
    expect(harness.problems()).toEqual([]);
  });
});
