import { describe, expect, it } from 'vitest';

import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import type { AdditionPlan } from '../model';
import { edgesDrawnForAddition } from '../pedigreeLinks';
import { config, link } from './fixtures';

const endpointsOf = (edges: ReturnType<typeof edgesDrawnForAddition>) =>
  edges.map((edge) => ({
    id: edge[entityPrimaryKeyProperty],
    type: edge.type,
    from: edge.from,
    to: edge.to,
  }));

const plan = (links: AdditionPlan['links']): AdditionPlan => ({
  people: [],
  links,
});

describe('edgesDrawnForAddition', () => {
  it('draws a planned link the network records in the same order once, as the recorded edge', () => {
    expect(
      endpointsOf(
        edgesDrawnForAddition(
          plan([{ source: 'mum', target: 'sib', kind: 'biological' }]),
          [link('mum', 'sib', 'biological')],
          config,
        ),
      ),
    ).toEqual([
      {
        id: 'mum-sib-biological',
        type: config.relationshipType,
        from: 'mum',
        to: 'sib',
      },
    ]);
  });

  it('draws a planned parent link as a draft when the network records only the reverse edge', () => {
    expect(
      endpointsOf(
        edgesDrawnForAddition(
          plan([{ source: 'mum', target: 'sib', kind: 'biological' }]),
          [link('sib', 'mum', 'biological')],
          config,
        ),
      ),
    ).toEqual([
      {
        id: 'sib-mum-biological',
        type: config.relationshipType,
        from: 'sib',
        to: 'mum',
      },
      { id: 'draft-0', type: config.relationshipType, from: 'mum', to: 'sib' },
    ]);
  });

  it('draws a planned link as a draft when the network records it only under another edge type', () => {
    const friendship = {
      ...link('mum', 'sib', 'biological'),
      type: 'friendship',
    };
    expect(
      endpointsOf(
        edgesDrawnForAddition(
          plan([{ source: 'mum', target: 'sib', kind: 'biological' }]),
          [friendship],
          config,
        ),
      ),
    ).toEqual([
      {
        id: 'mum-sib-biological',
        type: 'friendship',
        from: 'mum',
        to: 'sib',
      },
      { id: 'draft-0', type: config.relationshipType, from: 'mum', to: 'sib' },
    ]);
  });

  it('draws the recorded links of one addition once and the rest as drafts', () => {
    expect(
      endpointsOf(
        edgesDrawnForAddition(
          {
            ...plan([
              { source: 'mum', target: 'sib', kind: 'biological' },
              { source: 'dad', target: 'sib', kind: 'biological' },
            ]),
            twins: [{ source: 'ego', target: 'sib', zygosity: 'fraternal' }],
          },
          [link('mum', 'sib', 'biological'), link('dad', 'ego', 'biological')],
          config,
        ),
      ),
    ).toEqual([
      {
        id: 'mum-sib-biological',
        type: config.relationshipType,
        from: 'mum',
        to: 'sib',
      },
      {
        id: 'dad-ego-biological',
        type: config.relationshipType,
        from: 'dad',
        to: 'ego',
      },
      { id: 'draft-0', type: config.relationshipType, from: 'dad', to: 'sib' },
      {
        id: 'draft-twin-0',
        type: config.relationshipType,
        from: 'ego',
        to: 'sib',
      },
    ]);
  });

  it('leaves out the links of a stand-in who gives way', () => {
    expect(
      endpointsOf(
        edgesDrawnForAddition(
          { ...plan([]), removedLinkIds: ['standIn-ego-biological'] },
          [
            link('mum', 'ego', 'biological'),
            link('standIn', 'ego', 'biological'),
          ],
          config,
        ),
      ).map(({ id }) => id),
    ).toEqual(['mum-ego-biological']);
  });
});
