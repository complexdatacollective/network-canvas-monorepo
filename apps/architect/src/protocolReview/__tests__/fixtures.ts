import { withInterfaceText } from '@codaco/interview/supplied-wording';
import type {
  Finding,
  FixOperation,
} from '@codaco/protocol-review-worker/contract';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';
import type { StudyContext } from '@codaco/shared-consts';

export const STUDY_CONTEXT: StudyContext = {
  synopsis: 'A cross-sectional study of advice networks in later life.',
  population: 'Adults over 65 living alone',
  administration: 'face_to_face',
  researchQuestions: ['Who do older adults turn to for advice?'],
};

export const WELCOME_STAGE_ID = ProtocolObjectIdSchema.parse(
  '5b0c2a4e-1f7d-4c3a-8e9b-0a1b2c3d4e01',
);
export const INTRO_ITEM_ID = ProtocolObjectIdSchema.parse(
  '5b0c2a4e-1f7d-4c3a-8e9b-0a1b2c3d4e02',
);
export const NAMES_STAGE_ID = ProtocolObjectIdSchema.parse(
  '5b0c2a4e-1f7d-4c3a-8e9b-0a1b2c3d4e03',
);
export const NAMES_PROMPT_ID = ProtocolObjectIdSchema.parse(
  '5b0c2a4e-1f7d-4c3a-8e9b-0a1b2c3d4e04',
);
export const FINISH_STAGE_ID = ProtocolObjectIdSchema.parse(
  '5b0c2a4e-1f7d-4c3a-8e9b-0a1b2c3d4e05',
);

/**
 * A small, valid schema 9 protocol in two languages: an Information stage, a
 * quick-add name generator with one prompt, and a node type whose ordinal
 * variable has options (an array without ids).
 */
export const makeProtocol = (
  overrides: Partial<CurrentProtocol> = {},
): CurrentProtocol =>
  withInterfaceText<CurrentProtocol>({
    name: 'Advice study',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    experiments: { protocolReview: { studyContext: STUDY_CONTEXT } },
    assetManifest: {},
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name_var: { name: 'name', type: 'text' },
            freq: {
              name: 'freq',
              type: 'ordinal',
              options: [
                { label: { en: 'Often', fr: 'Souvent' }, value: 1 },
                { label: { en: 'Rarely', fr: 'Rarement' }, value: 2 },
              ],
            },
          },
        },
      },
      edge: {},
      ego: {},
    },
    stages: [
      {
        id: WELCOME_STAGE_ID,
        type: 'Information',
        label: { en: 'Welcome', fr: 'Bienvenue' },
        title: { en: 'Hello', fr: 'Bonjour' },
        items: [
          {
            id: INTRO_ITEM_ID,
            type: 'text',
            content: { en: 'Hi', fr: 'Salut' },
          },
        ],
      },
      {
        id: NAMES_STAGE_ID,
        type: 'NameGeneratorQuickAdd',
        label: { en: 'Names', fr: 'Noms' },
        subject: { entity: 'node', type: 'person' },
        quickAdd: asEntityAttributeReference('name_var'),
        prompts: [
          { id: NAMES_PROMPT_ID, text: { en: 'Name people', fr: 'Nommez' } },
        ],
        addNamePlaceholder: { en: 'Type a name', fr: 'Tapez un nom' },
      },
      {
        id: FINISH_STAGE_ID,
        type: 'FinishSession',
        mode: 'confirmation',
        outcome: 'completed',
        label: { en: 'Finish', fr: 'Fin' },
        finishLabel: { en: 'Finish', fr: 'Terminer' },
        finishConfirmation: { en: 'Finish now?', fr: 'Terminer ?' },
        finishFailed: { en: 'Could not finish.', fr: 'Échec.' },
        content: { en: 'The end.', fr: 'La fin.' },
        finishedContent: { en: 'Thank you.', fr: 'Merci.' },
      },
    ],
    ...overrides,
  });

export const op = (
  kind: FixOperation['op'],
  path: string,
  value?: unknown,
): FixOperation => ({
  op: kind,
  path,
  value: value === undefined ? null : JSON.stringify(value),
});

export const makeFinding = (
  id: string,
  operations: FixOperation[],
  overrides: Partial<Finding> = {},
): Finding => ({
  id,
  severity: 'worth_fixing',
  category: 'wording',
  title: `Problem ${id}`,
  explanation: 'Participants may misread this.',
  stageId: null,
  codebookEntity: null,
  codebookTypeId: null,
  fix: { summary: 'Reword it.', changes: ['Reword the prompt'], operations },
  ...overrides,
});
