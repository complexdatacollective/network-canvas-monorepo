import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  type LocalizedString,
  type Stage,
  validateProtocol,
} from '@codaco/protocol-validation';

import { buildProtocolWithStage } from '../buildProtocolWithStage';

// A minimal, valid current-schema protocol containing a single name generator
// stage whose codebook subject ("person") exists. Tests insert/replace panels
// onto this stage to exercise how `buildProtocolWithStage` normalises wip stage
// edits before they are validated/previewed.
const STAGE_ID = 'stage-1';

const localized = (text: string): LocalizedString => ({ en: text });

function makeProtocol(stageOverrides: Partial<Stage> = {}): CurrentProtocol {
  const stage = {
    id: STAGE_ID,
    type: 'NameGenerator',
    label: localized('Name some people'),
    subject: { entity: 'node', type: 'person' },
    form: {
      title: localized('Add person'),
      fields: [{ variable: 'name', prompt: localized('Name') }],
    },
    prompts: [{ id: 'prompt-1', text: localized('Who do you know?') }],
    ...stageOverrides,
  } as Stage;

  return {
    name: 'Test Protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {
      node: {
        person: {
          name: 'Person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: {
              name: 'Name',
              label: 'Name',
              type: 'text',
              component: 'Text',
            },
          },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
    stages: [
      stage,
      {
        id: 'finish',
        type: 'FinishSession',
        label: localized('Finish'),
        title: localized('All done'),
        content: localized('Thank you.'),
        finishLabel: { en: 'Finish' },
        finishConfirmation: { en: 'Finish this interview?' },
        finishedNotice: { en: 'This interview is finished.' },
        finishFailed: { en: 'The interview could not be finished.' },
        outcome: 'completed',
      },
    ],
  };
}

describe('buildProtocolWithStage', () => {
  it('prunes a direct draft’s invalid null filter before preview', async () => {
    // Callers outside the form can construct a draft that has not crossed the
    // typed field writer. Preview must still match the pruned commit boundary.
    const wipStage = {
      ...makeProtocol().stages[0],
      panels: [
        {
          id: 'panel-1',
          title: { en: 'My roster' },
          dataSource: 'roster-asset-id',
          filter: null,
        },
      ],
    } as unknown as Stage;

    // Sanity check: the raw, unpruned draft is what used to reach the validator
    // and fail — `FilterSchema.optional()` accepts `undefined`, not `null`.
    const rawProtocol = makeProtocol();
    rawProtocol.stages[0] = wipStage;
    const rawResult = await validateProtocol(rawProtocol);
    expect(rawResult.success).toBe(false);

    // After build (which prunes), the null filter is gone and validation passes.
    const builtProtocol = buildProtocolWithStage(
      makeProtocol(),
      wipStage,
      STAGE_ID,
    );
    const panel = (
      builtProtocol.stages[0] as Stage & {
        panels: { filter?: unknown }[];
      }
    ).panels[0];
    expect(panel).not.toHaveProperty('filter');

    const builtResult = await validateProtocol(builtProtocol);
    expect(builtResult.success).toBe(true);
  });

  it('leaves a panel with no title as an invalid protocol so preview stays disabled', async () => {
    // A panel created but not yet titled. Pruning strips the null/undefined
    // title entirely, leaving the required `title` field missing — which keeps
    // the wip protocol invalid, and therefore preview disabled.
    for (const title of [null, undefined]) {
      const wipStage = {
        ...makeProtocol().stages[0],
        panels: [
          {
            id: 'panel-1',
            title,
            dataSource: 'existing',
            filter: null,
          },
        ],
      } as unknown as Stage;

      const builtProtocol = buildProtocolWithStage(
        makeProtocol(),
        wipStage,
        STAGE_ID,
      );
      const panel = (
        builtProtocol.stages[0] as Stage & {
          panels: { title?: unknown }[];
        }
      ).panels[0];
      expect(panel).not.toHaveProperty('title');

      const result = await validateProtocol(builtProtocol);
      expect(result.success).toBe(false);
    }
  });

  it('inserts a new stage with a generated id when stageId is null', () => {
    const protocol = makeProtocol();
    const newStage = {
      type: 'Information',
      label: { en: 'Intro' },
    } as unknown as Stage;

    const built = buildProtocolWithStage(protocol, newStage, null, 0);

    expect(built.stages).toHaveLength(3);
    expect(built.stages[0]?.id).toBeTruthy();
    expect(built.stages[1]?.id).toBe(STAGE_ID);
    expect(built.stages[2]?.id).toBe('finish');
  });

  it('puts a new stage before the finish stage, where a save would put it', () => {
    const newStage = {
      type: 'Information',
      label: { en: 'Intro' },
    } as unknown as Stage;

    for (const insertAt of [undefined, 2]) {
      const built = buildProtocolWithStage(
        makeProtocol(),
        newStage,
        null,
        insertAt,
      );
      expect(built.stages.map(({ type }) => type)).toEqual([
        'NameGenerator',
        'Information',
        'FinishSession',
      ]);
    }
  });
});
