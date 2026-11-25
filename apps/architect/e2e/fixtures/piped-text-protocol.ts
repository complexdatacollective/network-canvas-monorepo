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
} from '@codaco/protocol-validation';

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
const EGO_FORM_STAGE_ID = objectId('ego-form');
export const INFO_STAGE_ID = objectId('info');
export const ANSWERS_STAGE_ID = objectId('answers');

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
          introductionPanel: { title: en('About you'), text: en('Tell us.') },
          form: {
            fields: [
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
          },
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

/** The ICU message a stage holds for text that shows the nickname when it is known. */
const NICKNAME_TITLE = `Hello{${EGO_NICKNAME_NAME}, select, missing {} other {, {${EGO_NICKNAME_NAME}}}}`;

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
