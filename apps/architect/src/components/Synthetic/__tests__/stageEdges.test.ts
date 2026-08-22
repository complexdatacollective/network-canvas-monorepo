import { describe, expect, it } from 'vitest';

import { stageCreatesEdges } from '../stageEdges';

/**
 * Whether a stage creates edges at all, over the REAL stage schema: which
 * shape a stage type states its edges in is asked of that schema, so nothing
 * here is mocked and a stage type that changed shape would fail here.
 */

const sociogram = (overrides: Record<string, unknown> = {}) => ({
  id: 'stage-2',
  type: 'Sociogram',
  label: 'Position people',
  subject: { entity: 'node', type: 'person' },
  background: { concentricCircles: 4, skewedTowardCenter: true },
  prompts: [
    {
      id: 'prompt-1',
      text: 'Position them',
      layout: { layoutVariable: 'layout' },
    },
  ],
  ...overrides,
});

const networkComposer = (overrides: Record<string, unknown> = {}) => ({
  id: 'stage-5',
  type: 'NetworkComposer',
  label: 'Build the network',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layout',
  ...overrides,
});

describe('edge-creating prompts', () => {
  it('is false for a sociogram whose prompts only display edges', () => {
    expect(
      stageCreatesEdges(
        sociogram({
          prompts: [
            {
              id: 'p1',
              text: 'Look',
              layout: { layoutVariable: 'layout' },
              edges: { display: ['friend'] },
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is true once a prompt creates one', () => {
    expect(
      stageCreatesEdges(
        sociogram({
          prompts: [
            {
              id: 'p1',
              text: 'Link them',
              layout: { layoutVariable: 'layout' },
              edges: { create: 'friend' },
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('reads a census prompt’s own edge declaration', () => {
    expect(
      stageCreatesEdges({
        type: 'DyadCensus',
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'friend' },
        ],
      }),
    ).toBe(true);
  });
});

describe('a stage that lists its own drawable edge types', () => {
  it('creates edges only where the list has entries', () => {
    expect(
      stageCreatesEdges(
        networkComposer({
          edges: [{ id: 'e1', subject: { entity: 'edge', type: 'friend' } }],
        }),
      ),
    ).toBe(true);
  });

  it('creates none while the list is empty', () => {
    expect(stageCreatesEdges(networkComposer({ edges: [] }))).toBe(false);
  });

  it('creates none once the empty list has been pruned away', () => {
    // The editor's `prune` strips `edges: []` on save, and the simulator walks
    // `stage.edges ?? []` either way — so the saved shape has to read the same
    // as the mid-edit one, rather than falling through to "assume yes".
    expect(stageCreatesEdges(networkComposer())).toBe(false);
  });
});

describe('a stage with neither shape', () => {
  it('is not gated at all', () => {
    expect(
      stageCreatesEdges({
        id: 'stage-4',
        type: 'EgoForm',
        label: 'About you',
        form: { title: 'About you', fields: [{ variable: 'age' }] },
      }),
    ).toBe(true);
  });
});
