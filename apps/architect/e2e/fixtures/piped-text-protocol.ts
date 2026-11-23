import { withInterfaceText } from '@codaco/interview/supplied-wording';
import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  deterministicProtocolObjectId,
} from '@codaco/protocol-validation';

import { emptyProtocol } from './seed.js';

export const EGO_FIRST_NAME_ID = 'firstName';
export const EGO_AGE_ID = 'age';
export const EGO_MOOD_ID = 'mood';
const NODE_NICKNAME_ID = 'nickname';

/** Stage ids the specs open by address. */
const objectId = deterministicProtocolObjectId(
  '6f1d2c3b-4a5e-4f60-8a71-9b2c3d4e5f60',
);
const EGO_FORM_STAGE_ID = objectId('ego-form');
export const INFO_STAGE_ID = objectId('info');
export const ANSWERS_STAGE_ID = objectId('answers');

/** An ego attribute no form collects, so only a stage's text can use it. */
export const EGO_NICKNAME_ID = 'egoNickname';

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
                { value: 'happy', label: en('Happy') },
                { value: 'sad', label: en('Sad') },
                { value: 'calm', label: en('Calm') },
              ],
            },
          },
        },
        node: {
          person: {
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
          title: en('Welcome to the study'),
          items: [
            { id: objectId('info-text'), type: 'text', content: en('Thanks.') },
          ],
        },
        {
          id: ANSWERS_STAGE_ID,
          type: 'Information',
          label: en('Your answers'),
          title: en('How are you'),
          items: [
            {
              id: objectId('answers-text'),
              type: 'text',
              content: en('Thanks.'),
            },
          ],
        },
        finish,
      ],
    }),
  );
}

/** The ICU message a stage holds for text that shows `{nick}` when it is known. */
const NICKNAME_TITLE = 'Hello{nick, select, missing {} other {, {nick}}}';

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
          ? {
              ...stage,
              title: { en: NICKNAME_TITLE },
              dynamicValues: { nick: { path: `ego.${EGO_NICKNAME_ID}` } },
            }
          : { ...stage, title: { en: 'Hello' } }
        : stage,
    ),
  });
}

/** The imported text a stage holds that names a value it does not bind. */
export const GHOST_TITLE = '{ghost} welcome';

/**
 * A protocol whose Information stage heading names a value its stage never
 * binds, as a protocol written by hand or by another tool can. Not parsed:
 * the app's own checks are what refuse it.
 */
export function protocolNamingUnboundValue(): CurrentProtocol {
  const protocol = pipedTextProtocol();
  return {
    ...protocol,
    stages: protocol.stages.map((stage) =>
      stage.id === INFO_STAGE_ID && stage.type === 'Information'
        ? { ...stage, title: { en: GHOST_TITLE } }
        : stage,
    ),
  };
}
