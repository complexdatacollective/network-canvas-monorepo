import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  type Stage,
  validateProtocol,
} from '@codaco/protocol-validation';
import { BUNDLED_TEMPLATES } from '~/templates';

import {
  buildProtocolWithStage,
  normalizePreviewStage,
  shouldOverridePreviewStage,
} from '../buildProtocolWithStage';

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
    form: {
      title: 'Add person',
      fields: [{ variable: 'name', prompt: 'Name' }],
    },
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
          variables: {
            name: { name: 'Name', type: 'text', component: 'Text' },
          },
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

describe('normalizePreviewStage', () => {
  const stageWithSkipLogic = {
    id: STAGE_ID,
    type: 'NameGenerator',
    label: 'Name some people',
    _modified: true,
    skipLogic: { action: 'SKIP', filter: { join: 'AND', rules: [] } },
  } as unknown as Stage;

  it('always drops the editor-only _modified field', () => {
    const stage = normalizePreviewStage(stageWithSkipLogic);
    expect(stage).not.toHaveProperty('_modified');
  });

  it('keeps the real skip logic in the preview protocol', () => {
    expect(normalizePreviewStage(stageWithSkipLogic)).toHaveProperty(
      'skipLogic',
    );
  });
});

describe('shouldOverridePreviewStage', () => {
  const informationStage = (id: string, skipLogic?: Stage['skipLogic']) =>
    ({
      id,
      type: 'Information',
      label: id,
      ...(skipLogic ? { skipLogic } : {}),
    }) as Stage;

  const protocolWithStages = (stages: Stage[]) => ({
    ...makeProtocol(),
    stages,
  });

  const skipToFinish = {
    action: 'SKIP',
    filter: { join: 'AND', rules: [] },
    destination: { type: 'finish' },
  } as Stage['skipLogic'];

  it('does not override a stage with no possible skip route', () => {
    const protocol = protocolWithStages([
      informationStage('notes'),
      informationStage('consent'),
    ]);

    expect(shouldOverridePreviewStage(protocol, 0, true)).toBe(false);
    expect(shouldOverridePreviewStage(protocol, 1, true)).toBe(false);
  });

  it('never overrides when the preview preference is off', () => {
    const protocol = protocolWithStages([
      informationStage('conditional', skipToFinish),
      informationStage('bypassed'),
    ]);

    expect(shouldOverridePreviewStage(protocol, 0, false)).toBe(false);
    expect(shouldOverridePreviewStage(protocol, 1, false)).toBe(false);
  });

  it.each(['SHOW', 'SKIP'] as const)(
    'detects a stage with its own %s logic',
    (action) => {
      const protocol = protocolWithStages([
        informationStage('intro'),
        informationStage('conditional', {
          ...skipToFinish,
          action,
        } as Stage['skipLogic']),
      ]);

      expect(shouldOverridePreviewStage(protocol, 1, true)).toBe(true);
    },
  );

  it('matches the bundled Mental Health Networks preview route', () => {
    const protocol = BUNDLED_TEMPLATES.find(
      (template) => template.id === 'mental-health-networks',
    )?.protocol;

    expect(protocol).toBeDefined();
    if (!protocol) return;

    expect(protocol.stages.slice(0, 3).map((stage) => stage.label)).toEqual([
      'Template notes (delete before fielding)',
      'Welcome and consent',
      'About you',
    ]);
    expect(shouldOverridePreviewStage(protocol, 0, true)).toBe(false);
    expect(shouldOverridePreviewStage(protocol, 1, true)).toBe(false);
    expect(shouldOverridePreviewStage(protocol, 2, true)).toBe(true);
  });

  it('detects an earlier finish destination that can bypass the stage', () => {
    const protocol = protocolWithStages([
      informationStage('conditional', skipToFinish),
      informationStage('bypassed'),
    ]);

    expect(shouldOverridePreviewStage(protocol, 1, true)).toBe(true);
  });

  it('detects an earlier stage destination that jumps past the stage', () => {
    const protocol = protocolWithStages([
      informationStage('conditional', {
        action: 'SKIP',
        filter: { join: 'AND', rules: [] },
        destination: { type: 'stage', stageId: 'destination' },
      } as Stage['skipLogic']),
      informationStage('bypassed'),
      informationStage('destination'),
    ]);

    expect(shouldOverridePreviewStage(protocol, 1, true)).toBe(true);
  });

  it('does not treat the destination itself as bypassed', () => {
    const protocol = protocolWithStages([
      informationStage('conditional', {
        action: 'SKIP',
        filter: { join: 'AND', rules: [] },
        destination: { type: 'stage', stageId: 'destination' },
      } as Stage['skipLogic']),
      informationStage('destination'),
    ]);

    expect(shouldOverridePreviewStage(protocol, 1, true)).toBe(false);
  });

  it('rejects an out-of-range stage index', () => {
    expect(
      shouldOverridePreviewStage(
        protocolWithStages([informationStage('intro')]),
        1,
        true,
      ),
    ).toBe(false);
  });
});
