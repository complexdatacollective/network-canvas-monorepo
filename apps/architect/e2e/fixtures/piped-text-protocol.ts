import { withInterfaceText } from '@codaco/interview/supplied-wording';
import {
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  deterministicProtocolObjectId,
  dynamicValueNameFor,
  fieldBlockMarkdown,
  optionCaseKey,
  printContentDocument,
} from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';

import { emptyProtocol } from './seed.js';

export const EGO_FIRST_NAME_ID = testVariableId('firstName');
export const EGO_AGE_ID = testVariableId('age');
export const EGO_MOOD_ID = testVariableId('mood');
const NODE_NICKNAME_ID = testVariableId('nickname');
const PERSON_TYPE_ID = testTypeId('person');

/** Stage ids the specs open by address. */
const objectId = deterministicProtocolObjectId(
  '6f1d2c3b-4a5e-4f60-8a71-9b2c3d4e5f60',
);
export const EGO_FORM_STAGE_ID = objectId('ego-form');
export const INFO_STAGE_ID = objectId('info');
const ANSWERS_STAGE_ID = objectId('answers');

/** The mood attribute's options, by the id text chooses each by. */
export const MOOD_OPTION_IDS = {
  happy: objectId('mood-happy'),
  sad: objectId('mood-sad'),
  calm: objectId('mood-calm'),
} as const;

/** An ego attribute no form collects, so only a stage's text can use it. */
export const EGO_NICKNAME_ID = testVariableId('egoNickname');

/**
 * A protocol with an ego form that collects three attributes (a name, an age
 * and a mood with three answers), an Information stage after it, and a person
 * node type whose `nickname` is an attribute no Information stage can show.
 */
export function pipedTextProtocol(
  localization: CurrentProtocol['localization'] = {
    defaultLocale: 'en',
    locales: ['en'],
  },
): CurrentProtocol {
  const base = emptyProtocol(localization);
  const [finish] = base.stages;
  if (finish === undefined) throw new Error('the empty protocol has a stage');
  const en = (text: string) => ({ en: text });
  return CurrentProtocolSchema.parse(
    withInterfaceText({
      ...base,
      codebook: {
        ego: {
          variables: {
            [EGO_FIRST_NAME_ID]: {
              name: 'first_name',
              type: 'text',
              component: 'Text',
            },
            [EGO_AGE_ID]: { name: 'age', type: 'number', component: 'Number' },
            [EGO_MOOD_ID]: {
              name: 'mood',
              type: 'categorical',
              component: 'CheckboxGroup',
              options: [
                {
                  id: MOOD_OPTION_IDS.happy,
                  value: 'happy',
                  label: en('Happy'),
                },
                { id: MOOD_OPTION_IDS.sad, value: 'sad', label: en('Sad') },
                { id: MOOD_OPTION_IDS.calm, value: 'calm', label: en('Calm') },
              ],
            },
          },
        },
        node: {
          [PERSON_TYPE_ID]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              [NODE_NICKNAME_ID]: {
                name: 'nickname',
                type: 'text',
                component: 'Text',
              },
            },
          },
        },
      },
      stages: [
        {
          id: EGO_FORM_STAGE_ID,
          type: 'EgoForm',
          label: en('About you'),
          form: formOf(
            [
              {
                id: objectId('f1'),
                variable: EGO_FIRST_NAME_ID,
                prompt: en('Your name?'),
              },
              {
                id: objectId('f2'),
                variable: EGO_AGE_ID,
                prompt: en('Your age?'),
              },
              {
                id: objectId('f3'),
                variable: EGO_MOOD_ID,
                prompt: en('Your mood?'),
              },
            ],
            { before: '# About you\n\nTell us.' },
          ),
        },
        {
          id: INFO_STAGE_ID,
          type: 'Information',
          label: en('Welcome'),
          content: en('Welcome to the study'),
        },
        {
          id: ANSWERS_STAGE_ID,
          type: 'Information',
          label: en('Your answers'),
          content: en('How are you'),
        },
        finish,
      ],
    }),
  );
}

/** The name text uses for the ego nickname: its id, written as a name. */
const EGO_NICKNAME_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: EGO_NICKNAME_ID,
});

/** The ICU message a stage holds for text that shows the nickname. */
const NICKNAME_TITLE = `Hello, {${EGO_NICKNAME_NAME}}`;

/**
 * The protocol above with an ego attribute that no form collects. With
 * `shown`, the Information stage shows it, so the stage's piped text is its
 * only use; without, the stage says the same words and nothing uses it.
 */
export function protocolWithNickname({
  shown,
}: {
  shown: boolean;
}): CurrentProtocol {
  const protocol = pipedTextProtocol();
  return CurrentProtocolSchema.parse({
    ...protocol,
    codebook: {
      ...protocol.codebook,
      ego: {
        variables: {
          ...protocol.codebook.ego?.variables,
          [EGO_NICKNAME_ID]: {
            name: 'ego_nickname',
            type: 'text',
            component: 'Text',
          },
        },
      },
    },
    stages: protocol.stages.map((stage) =>
      stage.id === INFO_STAGE_ID && stage.type === 'Information'
        ? shown
          ? { ...stage, content: { en: NICKNAME_TITLE } }
          : { ...stage, content: { en: 'Hello' } }
        : stage,
    ),
  });
}

/** The imported text a stage holds that names a value that does not exist. */
export const GHOST_TITLE = '{ghost} welcome';

/**
 * A protocol whose Information stage text names a value that stands for
 * nothing, as a protocol written by hand or by another tool can. Not parsed:
 * the app's own checks are what refuse it.
 */
export function protocolNamingUnknownValue(): CurrentProtocol {
  const protocol = pipedTextProtocol();
  return {
    ...protocol,
    stages: protocol.stages.map((stage) =>
      stage.id === INFO_STAGE_ID && stage.type === 'Information'
        ? { ...stage, content: { en: GHOST_TITLE } }
        : stage,
    ),
  };
}

/** The dynamic attribute that `protocolWithDynamicAttribute` gives the stage. */
export const MOOD_WORDING_ID = objectId('mood-wording');

/**
 * The protocol above in English and Spanish, with a dynamic attribute on the
 * Information stage that words the participant's mood. The English text
 * shows it; the Spanish text says nothing yet.
 */
export function protocolWithDynamicAttribute(): CurrentProtocol {
  const protocol = pipedTextProtocol({
    defaultLocale: 'en',
    locales: ['en', 'es'],
  });
  const mood = dynamicValueNameFor({
    kind: 'attribute',
    role: 'ego',
    variableId: EGO_MOOD_ID,
  });
  const wording = dynamicValueNameFor({
    kind: 'dynamicAttribute',
    id: MOOD_WORDING_ID,
  });
  return CurrentProtocolSchema.parse({
    ...protocol,
    stages: protocol.stages.map((stage) =>
      stage.id === INFO_STAGE_ID && stage.type === 'Information'
        ? {
            ...stage,
            label: { en: 'Welcome', es: 'Bienvenida' },
            content: { en: `You seem {${wording}} today.`, es: 'Hola.' },
            dynamicAttributes: {
              [MOOD_WORDING_ID]: {
                logic: 'answers',
                value: mood,
                missing: { en: 'well' },
                answers: [
                  {
                    answer: optionCaseKey(MOOD_OPTION_IDS.happy),
                    wording: { en: 'happy' },
                  },
                  {
                    answer: optionCaseKey(MOOD_OPTION_IDS.sad),
                    wording: { en: 'sad' },
                  },
                  {
                    answer: optionCaseKey(MOOD_OPTION_IDS.calm),
                    wording: { en: 'calm' },
                  },
                ],
                other: { en: 'well' },
              },
            },
          }
        : stage,
    ),
  });
}

/**
 * The protocol of `protocolWithDynamicAttribute`, whose Ego Form also has a
 * Spanish document: it asks for the name and the mood, and leaves out the
 * age, so the age question is not used in Spanish.
 */
export function protocolWithSpanishForm(): CurrentProtocol {
  const protocol = protocolWithDynamicAttribute();
  return CurrentProtocolSchema.parse({
    ...protocol,
    stages: protocol.stages.map((stage) =>
      stage.id === EGO_FORM_STAGE_ID && stage.type === 'EgoForm'
        ? {
            ...stage,
            label: { en: 'About you', es: 'Sobre ti' },
            form: {
              content: {
                ...stage.form.content,
                es: [
                  '# Sobre ti',
                  fieldBlockMarkdown(objectId('f1')),
                  fieldBlockMarkdown(objectId('f3')),
                ].join('\n\n'),
              },
              fields: stage.form.fields.map((field) => ({
                ...field,
                prompt: {
                  ...field.prompt,
                  ...(field.id === objectId('f1') && { es: '¿Tu nombre?' }),
                  ...(field.id === objectId('f3') && { es: '¿Tu ánimo?' }),
                },
              })),
            },
          }
        : stage,
    ),
  });
}

/** The ids of the Ego Form's fields, by the attribute each collects. */
export const FORM_FIELD_IDS = {
  firstName: objectId('f1'),
  age: objectId('f2'),
  mood: objectId('f3'),
} as const;

/** The dynamic attribute that `protocolWithFormLogic` gives the Ego Form. */
const FORM_MOOD_WORDING_ID = objectId('form-mood-wording');

/**
 * The protocol of `protocolWithSpanishForm`, whose English form text also
 * has a dynamic attribute in its heading and asks the age only of a happy
 * participant, in a logic block on the mood.
 */
export function protocolWithFormLogic(): CurrentProtocol {
  const protocol = protocolWithSpanishForm();
  const mood = dynamicValueNameFor({
    kind: 'attribute',
    role: 'ego',
    variableId: EGO_MOOD_ID,
  });
  const wording = dynamicValueNameFor({
    kind: 'dynamicAttribute',
    id: FORM_MOOD_WORDING_ID,
  });
  return CurrentProtocolSchema.parse({
    ...protocol,
    stages: protocol.stages.map((stage) =>
      stage.id === EGO_FORM_STAGE_ID && stage.type === 'EgoForm'
        ? {
            ...stage,
            dynamicAttributes: {
              [FORM_MOOD_WORDING_ID]: {
                logic: 'answers',
                value: mood,
                missing: { en: 'friend' },
                answers: [
                  {
                    answer: optionCaseKey(MOOD_OPTION_IDS.happy),
                    wording: { en: 'happy friend' },
                  },
                ],
                other: { en: 'friend' },
              },
            },
            form: {
              ...stage.form,
              content: {
                ...stage.form.content,
                en: printContentDocument([
                  {
                    kind: 'markdown',
                    nodes: [
                      { kind: 'text', text: '# About you, ' },
                      { kind: 'argument', name: wording },
                    ],
                  },
                  { kind: 'field', fieldId: objectId('f1') },
                  {
                    kind: 'logic',
                    logic: {
                      kind: 'answers',
                      value: mood,
                      missing: [],
                      versions: [
                        {
                          caseKey: optionCaseKey(MOOD_OPTION_IDS.happy),
                          content: [{ kind: 'field', fieldId: objectId('f2') }],
                        },
                      ],
                      other: [],
                    },
                  },
                  { kind: 'field', fieldId: objectId('f3') },
                ]),
              },
            },
          }
        : stage,
    ),
  });
}
