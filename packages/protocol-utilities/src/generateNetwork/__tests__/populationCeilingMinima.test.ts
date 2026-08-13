import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = {
  node: {
    person: {
      color: 'node-color-seq-1',
      variables: {
        'var-name': { name: 'Name', type: 'text' },
      },
    },
  },
} as unknown as Codebook;

/**
 * Stage 1 asks for 9998 people with NO declared minimum (all discretionary).
 * Stage 2 declares behaviours.minNodes: 5 and asks for exactly 5.
 * Total demand 10003 exceeds MAX_SYNTHETIC_POPULATION (10000) by 3, but a
 * valid allocation inside the cap exists: trim stage 1's discretionary count
 * to 9995 and keep stage 2's interface floor of 5. The live interview's
 * minNodes gate will not let a participant leave stage 2 below 5 nodes, so a
 * "completed session" with fewer than 5 stage-2 nodes is a state no
 * participant could produce.
 */
const stage1 = {
  id: 'stage-1',
  label: 'Big discretionary generator',
  type: 'NameGenerator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'Add a person',
    fields: [{ variable: 'var-name', prompt: 'Name' }],
  },
  prompts: [{ id: 'prompt-1', text: 'Add people' }],
  synthetic: { count: { distribution: 'constant', value: 9998 } },
} as unknown as Stage;

const stage2 = {
  id: 'stage-2',
  label: 'Floored generator',
  type: 'NameGenerator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'Add a person',
    fields: [{ variable: 'var-name', prompt: 'Name' }],
  },
  prompts: [{ id: 'prompt-2', text: 'Add more people' }],
  behaviours: { minNodes: 5 },
  synthetic: { count: { distribution: 'constant', value: 5 } },
} as unknown as Stage;

describe('population-ceiling trim vs declared stage minima', () => {
  it('honours a reachable minNodes floor by trimming discretionary counts first', () => {
    const { network } = generateNetwork({
      codebook,
      stages: [stage1, stage2],
      seed: 42,
    });

    const byStage = new Map<string, number>();
    for (const node of network.nodes) {
      const stageId = (node as unknown as { stageId?: string }).stageId;
      byStage.set(stageId ?? '?', (byStage.get(stageId ?? '?') ?? 0) + 1);
    }

    // The cap must hold...
    expect(network.nodes.length).toBeLessThanOrEqual(10_000);
    // ...but stage 2's declared interface minimum is satisfiable inside the
    // cap, so the completed session must contain at least 5 stage-2 nodes.
    expect(byStage.get('stage-2') ?? 0).toBeGreaterThanOrEqual(5);
  });
});
