import { describe, expect, it } from 'vitest';

import {
  dynamicValueNameFor,
  fieldIdsIn,
  optionCaseKey,
  printContentDocument,
  readContentDocument,
} from '@codaco/protocol-validation';

import type { StagedCodebook } from '../../state/stagedCodebook.ts';
import { testId, testOptionId, testVariableId } from '../../testing/testId.ts';
import { stageAsSaved } from '../stageAsSaved.ts';

const IDENTITY = { id: testId('stage/ego-form'), type: 'EgoForm' } as const;
const SEX = testVariableId('ego_sex');
const FEMALE = testOptionId(SEX, 'female');
const MALE = testOptionId(SEX, 'male');
const ASKED = testId('field/asked');
const ONLY_FOR_FEMALE = testId('field/only-for-female');
const AGE = testVariableId('ego_age');
const PREGNANT = testVariableId('ego_pregnant');

/**
 * An Ego Form whose second field is only in the version, of a logic block on
 * the participant's sex, for one option.
 */
const submitted = {
  label: 'About you',
  form: {
    content: {
      en: printContentDocument([
        { kind: 'field', fieldId: ASKED },
        {
          kind: 'logic',
          logic: {
            kind: 'answers',
            value: dynamicValueNameFor({
              kind: 'attribute',
              role: 'ego',
              variableId: SEX,
            }),
            missing: [],
            versions: [
              {
                caseKey: optionCaseKey(FEMALE),
                content: [{ kind: 'field', fieldId: ONLY_FOR_FEMALE }],
              },
            ],
            other: [],
          },
        },
      ]),
    },
    fields: [
      { id: ASKED, variable: AGE, prompt: { en: 'How old are you?' } },
      {
        id: ONLY_FOR_FEMALE,
        variable: PREGNANT,
        prompt: { en: 'Are you pregnant?' },
      },
    ],
  },
};

/** The ego's section, as the edit leaves it: `FEMALE` deleted. */
const femaleRemoved: StagedCodebook = {
  ego: {
    base: null,
    edited: {
      variables: {
        [SEX]: {
          name: 'sex',
          type: 'categorical',
          options: [{ id: MALE, label: 'Male', value: 'male' }],
        },
      },
    },
  },
};

const placedIn = (fields: Readonly<Record<string, unknown>>) => {
  const form = fields.form as typeof submitted.form;
  return fieldIdsIn(readContentDocument(form.content.en).nodes);
};

describe('a stage as a save writes it', () => {
  it('keeps the form as it is when no option is removed', () => {
    const saved = stageAsSaved(IDENTITY, submitted, {
      localization: undefined,
      staged: {},
    });
    expect(placedIn(saved)).toEqual([ASKED, ONLY_FOR_FEMALE]);
    expect((saved.form as typeof submitted.form).fields).toHaveLength(2);
  });

  // The version for a removed option goes before what nothing uses is left
  // out: the field that only that version placed is not used any more.
  it('leaves out a field that only the version for a removed option placed', () => {
    const saved = stageAsSaved(IDENTITY, submitted, {
      localization: undefined,
      staged: femaleRemoved,
    });
    expect(placedIn(saved)).toEqual([ASKED]);
    expect(
      (saved.form as typeof submitted.form).fields.map(({ id }) => id),
    ).toEqual([ASKED]);
  });
});
