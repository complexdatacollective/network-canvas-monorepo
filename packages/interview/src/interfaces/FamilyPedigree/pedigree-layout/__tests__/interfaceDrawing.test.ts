import { describe, expect, it } from 'vitest';

/**
 * Families drawn exactly as the interface draws them: read from the network
 * by the stage's own model, turned into links as FamilyPedigree turns them,
 * given the symbol shapes the codebook resolves, and laid out and routed by
 * the same call PedigreeLayout makes, with the interface's symbol size and
 * gaps. These tests check what the participant sees where several lines end
 * on one person.
 */
import {
  asEntityAttributeReference,
  type NodeDefinition,
} from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { resolveNodeShape } from '../../../../selectors/session';
import { config, link, person } from '../../__tests__/fixtures';
import { readFamily } from '../../model';
import { pedigreeLinksOf } from '../../pedigreeLinks';
import { childAttachments } from '../auxiliaryRouting';
import { FAMILY_PEDIGREE_GAPS } from '../layoutDimensions';
import { drawPedigree } from '../pedigreeAdapter';
import type { PedigreeSymbolShape } from '../types';
import {
  CENTRE_CLEARANCE,
  type Drawing,
  faultsOfLinesInto,
  MIN_END_GAP,
} from './lineFaults';

/** A small Node (`size-24`) at the default root font size, as FamilyPedigree
 * measures it, and as the e2e matrix renders it at 1280×720. */
const SYMBOL_SIZES = [96, 87];

/** The shape mapping the e2e matrix's codebook gives a person. */
const SHAPE: NodeDefinition['shape'] = {
  default: 'diamond',
  dynamic: {
    variable: asEntityAttributeReference('sex'),
    type: 'discrete',
    map: [
      { value: 'female', shape: 'circle' },
      { value: 'male', shape: 'square' },
    ],
  },
};

function drawAsInterface(
  nodes: NcNode[],
  edges: NcEdge[],
  size: number,
): Drawing {
  const family = readFamily(nodes, edges, config);
  const links = pedigreeLinksOf(family);
  const nodeIds = family.people.map((p) => p.id);
  const nodeShapes = new Map(
    family.people.map((p) => [
      p.id,
      resolveNodeShape(SHAPE, p.attributes) as PedigreeSymbolShape,
    ]),
  );
  const { positions, connectorData } = drawPedigree({
    nodeIds,
    links,
    nodeNames: new Map(family.people.map((p) => [p.id, p.name ?? ''])),
    nodeShapes,
    dimensions: { nodeWidth: size, nodeHeight: size, ...FAMILY_PEDIGREE_GAPS },
  });
  return {
    size,
    connectors: connectorData.connectors,
    centre: (id) => {
      const at = positions.get(id);
      if (!at) throw new Error(`${id} is not drawn`);
      return { x: at.x + size / 2, y: at.y + size / 2 };
    },
    shapeOf: (id) => nodeShapes.get(id) ?? 'circle',
  };
}

const woman = (id: string, name?: string, extra = {}) =>
  person(id, { sex: ['female'], ...(name ? { name } : {}), ...extra });
const man = (id: string, name?: string) =>
  person(id, { sex: ['male'], ...(name ? { name } : {}) });

/**
 * The e2e matrix's "relationship-kinds-drawn" family: an egg donor, a
 * surrogate who carried the participant, Ana who raises them, Luis their
 * father, Ana's partner, and Luis's former partner Sofia.
 */
function relationshipKindsFamily(egoSex: 'female' | 'male' = 'female') {
  const nodes = [
    person('ego', { name: 'Maya', sex: [egoSex], isEgo: true }),
    woman('mother', 'Ana'),
    man('father', 'Luis'),
    woman('donor'),
    woman('carrier'),
    woman('former', 'Sofia'),
  ];
  const edges = [
    link('mother', 'father', 'partner', { current: true }),
    link('father', 'former', 'partner', { current: false }),
    link('mother', 'ego', 'social', { carrier: false }),
    link('father', 'ego', 'biological', { carrier: false }),
    link('donor', 'ego', 'donor', { carrier: false }),
    link('carrier', 'ego', 'surrogate', { carrier: true }),
  ];
  return { nodes, edges };
}

describe('the lines into a participant with a donor, a surrogate and a social parent', () => {
  for (const size of SYMBOL_SIZES) {
    it(`end in their parents' order, apart, uncrossed and clear of each other (${size}px symbols)`, () => {
      const { nodes, edges } = relationshipKindsFamily();
      const drawing = drawAsInterface(nodes, edges, size);
      expect(faultsOfLinesInto(drawing, 'ego')).toEqual([]);
    });

    it(`seat the donor and the surrogate on either side of the parents (${size}px symbols)`, () => {
      const { nodes, edges } = relationshipKindsFamily();
      const { centre } = drawAsInterface(nodes, edges, size);
      const parents = [centre('mother').x, centre('father').x];
      const side = (id: string) =>
        centre(id).x < Math.min(...parents)
          ? 'left'
          : centre(id).x > Math.max(...parents)
            ? 'right'
            : 'between';
      expect(new Set([side('donor'), side('carrier')])).toEqual(
        new Set(['left', 'right']),
      );
    });

    it(`keep their order and spacing on a square participant (${size}px symbols)`, () => {
      const { nodes, edges } = relationshipKindsFamily('male');
      const drawing = drawAsInterface(nodes, edges, size);
      expect(faultsOfLinesInto(drawing, 'ego')).toEqual([]);
    });
  }
});

describe('more lines from one side than its usual places hold', () => {
  // Luis's two former partners fill the seats on his side, so both helpers
  // are seated beside Ana, and three lines reach the participant from the
  // left of their line of descent.
  function crowdedFamily(egoSex: 'female' | 'male') {
    const { nodes, edges } = relationshipKindsFamily(egoSex);
    return {
      nodes: [...nodes, woman('former2', 'Eva')],
      edges: [
        ...edges,
        link('father', 'former2', 'partner', { current: false }),
      ],
    };
  }

  for (const size of SYMBOL_SIZES) {
    for (const egoSex of ['female', 'male'] as const) {
      it(`still end in their parents' order, apart and uncrossed (${egoSex === 'female' ? 'circle' : 'square'}, ${size}px symbols)`, () => {
        const { nodes, edges } = crowdedFamily(egoSex);
        const drawing = drawAsInterface(nodes, edges, size);
        expect(faultsOfLinesInto(drawing, 'ego')).toEqual([]);
      });
    }
  }
});

describe('the places for the lines ending on one side of a child', () => {
  /** How far below the top of the box each symbol's edge lies at `o` from
   * the middle, as fractions of the symbol, as PersonNode draws it. */
  const depthOf: Record<'circle' | 'square', (o: number) => number> = {
    circle: (o) => 0.5 - Math.sqrt(0.25 - o * o),
    square: (o) => {
      const intoCorner = Math.abs(o) - 0.25;
      return intoCorner <= 0
        ? 0
        : 0.25 - Math.sqrt(0.0625 - intoCorner * intoCorner);
    },
  };
  // More lines from the left than the top of that side holds: three into a
  // circle, two into a square (whose flat top is half its width).
  for (const [shape, count] of [
    ['circle', 3],
    ['square', 2],
  ] as const) {
    it(`keeps ${count} lines into a ${shape} left of its line of descent, in order and apart`, () => {
      const parentXs = Array.from({ length: count }, (_, k) => -3 + k);
      const places = childAttachments(0, 1, shape, parentXs, true).map(
        (options) => options[0]!,
      );
      for (const o of places) {
        expect(o).toBeLessThanOrEqual(-CENTRE_CLEARANCE + 1e-6);
        expect(o).toBeGreaterThan(-0.5);
      }
      for (let k = 0; k + 1 < places.length; k++) {
        const [a, b] = [places[k]!, places[k + 1]!];
        expect(b).toBeGreaterThan(a);
        expect(
          Math.hypot(b - a, depthOf[shape](b) - depthOf[shape](a)),
        ).toBeGreaterThanOrEqual(MIN_END_GAP - 1e-6);
      }
    });
  }
});
