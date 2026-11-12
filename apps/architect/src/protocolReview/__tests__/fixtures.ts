import type {
  Finding,
  FixOperation,
} from '@codaco/protocol-review-worker/contract';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
  withInterfaceText,
} from '@codaco/protocol-validation';
import type { StudyContext } from '@codaco/shared-consts';

export const STUDY_CONTEXT: StudyContext = {
  synopsis: 'A cross-sectional study of advice networks in later life.',
  population: 'Adults over 65 living alone',
  administration: 'face_to_face',
  researchQuestions: ['Who do older adults turn to for advice?'],
};

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
        id: 'welcome',
        type: 'Information',
        label: { en: 'Welcome', fr: 'Bienvenue' },
        title: { en: 'Hello', fr: 'Bonjour' },
        items: [
          { id: 'intro', type: 'text', content: { en: 'Hi', fr: 'Salut' } },
        ],
      },
      {
        id: 'names',
        type: 'NameGeneratorQuickAdd',
        label: { en: 'Names', fr: 'Noms' },
        subject: { entity: 'node', type: 'person' },
        quickAdd: asEntityAttributeReference('name_var'),
        prompts: [{ id: 'p1', text: { en: 'Name people', fr: 'Nommez' } }],
        addNamePlaceholder: { en: 'Type a name', fr: 'Tapez un nom' },
      },
      {
        id: 'finish',
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
