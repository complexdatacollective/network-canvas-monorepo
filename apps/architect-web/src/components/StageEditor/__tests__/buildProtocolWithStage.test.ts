import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  type Stage,
  validateProtocol,
} from '@codaco/protocol-validation';

import { buildProtocolWithStage } from '../buildProtocolWithStage';

// A minimal, valid v8 protocol containing a single name generator stage whose
// codebook subject ("person") exists. Tests insert/replace panels onto this
// stage to exercise how `buildProtocolWithStage` normalises wip stage edits
// before they are validated/previewed.
const STAGE_ID = 'stage-1';

function makeProtocol(stageOverrides: Partial<Stage> = {}): CurrentProtocol {
  const stage = {
    id: STAGE_ID,
    type: 'NameGenerator',
    label: 'Name some people',
    subject: { entity: 'node', type: 'person' },
    form: { fields: [{ variable: 'name', prompt: 'Name' }] },
    prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
    ...stageOverrides,
  } as Stage;

  return {
    name: 'Test Protocol',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: { name: { name: 'Name', type: 'text' } },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
    stages: [stage],
  } as CurrentProtocol;
}

describe('buildProtocolWithStage', () => {
  it('prunes a freshly-created panel’s null filter so the wip protocol validates (regression)', async () => {
    // This is the shape `createNewPanel` pushes once the user gives the panel a
    // title and selects a roster: `filter` is still the placeholder `null`.
    const wipStage = {
      ...makeProtocol().stages[0],
      panels: [
        {
          id: 'panel-1',
          title: 'My roster',
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
      label: 'Intro',
    } as unknown as Stage;

    const built = buildProtocolWithStage(protocol, newStage, null, 0);

    expect(built.stages).toHaveLength(2);
    expect(built.stages[0]?.id).toBeTruthy();
    expect(built.stages[1]?.id).toBe(STAGE_ID);
  });
});
