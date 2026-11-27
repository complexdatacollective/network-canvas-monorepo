import { describe, expect, it } from 'vitest';

import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { testId } from '../../testing/testId.ts';
import { translatableStringsUsing } from '../DynamicTextField.tsx';

const PRONOUN = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: testId('dynamic/pronoun'),
});
const PLACE = testId('dynamic/place');

describe('the number of texts that use a dynamic attribute', () => {
  it('counts each text of the stage once, and not the wording of its dynamic attributes', () => {
    const stage = {
      prompts: [
        { text: { en: `Ask {${PRONOUN}}`, es: `Pregunta {${PRONOUN}}` } },
        { text: { en: 'Nothing here' } },
      ],
      form: {
        fields: [{ prompt: { en: `Is {${PRONOUN}} here?` } }],
      },
      dynamicAttributes: {
        [PLACE]: {
          logic: 'participant',
          participant: { en: `at {${PRONOUN}} school` },
          otherwise: { en: 'at work' },
        },
      },
    };

    expect(translatableStringsUsing(stage, PRONOUN)).toBe(2);
  });

  it('counts the text of a node type’s label', () => {
    expect(
      translatableStringsUsing(
        { text: { en: `{${PRONOUN}} friend` } },
        PRONOUN,
      ),
    ).toBe(1);
  });
});
