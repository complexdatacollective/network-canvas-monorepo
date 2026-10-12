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
  childrenReachedBy,
  type Drawing,
  faultsOfHelperLines,
  faultsOfLinesInto,
  faultsOfSiblingGrouping,
  type HelperTie,
  MIN_END_GAP,
  strictLineFaults,
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

/** The donors' and surrogates' recorded ties among the edges. */
const helperTiesOf = (edges: NcEdge[]): HelperTie[] =>
  edges.flatMap((edge) => {
    const [kind] = (edge.attributes as { kind: string[] }).kind;
    return kind === 'donor' || kind === 'surrogate'
      ? [{ parent: edge.from, child: edge.to, kind }]
      : [];
  });

/** Everyone drawn in a family. */
const idsOf = (nodes: NcNode[]) => nodes.map((node) => node._uid);

/**
 * Round 3 (Josh, 12 Oct 2026): a donor's or surrogate's line meets the line
 * of descent of exactly the children they gave to or carried. Children who
 * share donors sit together, as a run of their sibship; a run of two or more
 * hangs from a sub-bar on a stem of its own below the sibling bar, and the
 * donor's line ends on the stem, below the bar and above the sub-bar, in a
 * T. A run of one uses the child's own line up. A donor to every child joins
 * the sibling bar. Only a line to a run with siblings on both sides may hop
 * the sibling bar, once.
 */
describe('a donor’s line meets the line of descent of the children they gave to', () => {
  const mother = () => woman('hannah', 'Hannah');
  const birth = (child: string, parent = 'hannah') =>
    link(parent, child, 'biological', { carrier: parent === 'hannah' });
  const donor = (from: string, child: string) =>
    link(from, child, 'donor', { carrier: false });

  /** drawingCoverage's "a donor to two of three half-siblings". */
  function halfSiblings() {
    const nodes = [
      person('ego', { name: 'Maya', sex: ['male'], isEgo: true }),
      mother(),
      man('paul', 'Paul'),
      woman('ruby', 'Ruby'),
      man('theo', 'Theo'),
      man('theoDonor'),
    ];
    const edges = [
      birth('ego'),
      donor('paul', 'ego'),
      birth('ruby'),
      donor('paul', 'ruby'),
      birth('theo'),
      donor('theoDonor', 'theo'),
    ];
    return { nodes, edges };
  }

  /** Ruby, who shares Paul with the participant, was added after Theo. */
  function addedApart() {
    const nodes = [
      person('ego', { name: 'Maya', sex: ['male'], isEgo: true }),
      mother(),
      man('paul', 'Paul'),
      man('theo', 'Theo'),
      man('theoDonor'),
      woman('ruby', 'Ruby'),
    ];
    const edges = [
      birth('ego'),
      donor('paul', 'ego'),
      birth('theo'),
      donor('theoDonor', 'theo'),
      birth('ruby'),
      donor('paul', 'ruby'),
    ];
    return { nodes, edges };
  }

  /** A couple whose first two children were conceived with a sperm donor;
   * the father raises them, and is the third child's birth father. */
  function coupleWithDonor() {
    const nodes = [
      person('ego', { name: 'Maya', sex: ['female'], isEgo: true }),
      woman('ana', 'Ana'),
      man('luis', 'Luis'),
      man('spermDonor'),
      man('leo', 'Leo'),
      woman('mia', 'Mia'),
    ];
    const edges = [
      link('ana', 'luis', 'partner', { current: true }),
      link('ana', 'ego', 'biological', { carrier: true }),
      link('luis', 'ego', 'social', { carrier: false }),
      donor('spermDonor', 'ego'),
      link('ana', 'leo', 'biological', { carrier: true }),
      link('luis', 'leo', 'social', { carrier: false }),
      donor('spermDonor', 'leo'),
      link('ana', 'mia', 'biological', { carrier: true }),
      link('luis', 'mia', 'biological', { carrier: false }),
    ];
    return { nodes, edges };
  }

  /** A couple, both birth parents of their three children, two of whom a
   * surrogate carried. */
  function coupleWithSurrogate() {
    const nodes = [
      person('ego', { name: 'Maya', sex: ['female'], isEgo: true }),
      woman('ana', 'Ana'),
      man('luis', 'Luis'),
      woman('carrier'),
      man('leo', 'Leo'),
      woman('mia', 'Mia'),
    ];
    const edges = [
      link('ana', 'luis', 'partner', { current: true }),
      ...['ego', 'leo', 'mia'].flatMap((child) => [
        link('ana', child, 'biological', { carrier: child === 'mia' }),
        link('luis', child, 'biological', { carrier: false }),
      ]),
      link('carrier', 'ego', 'surrogate', { carrier: true }),
      link('carrier', 'leo', 'surrogate', { carrier: true }),
    ];
    return { nodes, edges };
  }

  /** Three donors, each to a run of the sibship: the middle run's donor
   * comes in over the sibling bar. */
  function threeDonors() {
    const nodes = [
      person('ego', { name: 'Maya', sex: ['male'], isEgo: true }),
      mother(),
      man('paul', 'Paul'),
      woman('ruby', 'Ruby'),
      man('theo', 'Theo'),
      man('tom', 'Tom'),
      man('theoDonor'),
      woman('mia', 'Mia'),
      man('miaDonor'),
    ];
    const edges = [
      birth('ego'),
      donor('paul', 'ego'),
      birth('ruby'),
      donor('paul', 'ruby'),
      birth('theo'),
      donor('theoDonor', 'theo'),
      birth('tom'),
      donor('theoDonor', 'tom'),
      birth('mia'),
      donor('miaDonor', 'mia'),
    ];
    return { nodes, edges };
  }

  /** One donor to all three children. */
  function oneDonorToAll() {
    const nodes = [
      person('ego', { name: 'Maya', sex: ['male'], isEgo: true }),
      mother(),
      man('paul', 'Paul'),
      woman('ruby', 'Ruby'),
      man('theo', 'Theo'),
    ];
    const edges = ['ego', 'ruby', 'theo'].flatMap((child) => [
      birth(child),
      donor('paul', child),
    ]);
    return { nodes, edges };
  }

  const families = {
    'a donor to two of three half-siblings': halfSiblings,
    'a donor to two siblings added apart': addedApart,
    'a couple with a surrogate for two of three children': coupleWithSurrogate,
    'three donors to three runs of a sibship': threeDonors,
    'one donor to every child': oneDonorToAll,
  };

  for (const size of SYMBOL_SIZES) {
    for (const [name, family] of Object.entries(families)) {
      it(`passes the strict line checks: ${name} (${size}px symbols)`, () => {
        const { nodes, edges } = family();
        const drawing = drawAsInterface(nodes, edges, size);
        expect(
          strictLineFaults(drawing, helperTiesOf(edges), idsOf(nodes)),
        ).toEqual([]);
      });
    }

    // Luis raises the two donor-conceived children, so his own lines to
    // them come down from beside Ana and cross the sibling bar to reach
    // them: the round 3 rule is about the donor's line, which is checked
    // here, and the grouping.
    it(`passes the strict checks of the donor's line: a couple with a sperm donor for two of three children (${size}px symbols)`, () => {
      const { nodes, edges } = coupleWithDonor();
      const drawing = drawAsInterface(nodes, edges, size);
      const ties = helperTiesOf(edges);
      expect([
        ...faultsOfHelperLines(drawing, ties, idsOf(nodes)),
        ...faultsOfSiblingGrouping(drawing, ties),
      ]).toEqual([]);
    });

    it(`reaches the two half-siblings who share a donor by one line, and the third by their own line up (${size}px symbols)`, () => {
      const { nodes, edges } = halfSiblings();
      const drawing = drawAsInterface(nodes, edges, size);
      const reached = (parent: string) =>
        drawing.connectors.auxiliaryLines
          .filter((line) => line.endpointIds?.[0] === parent)
          .map((line) => [...childrenReachedBy(drawing.connectors, line)]);
      expect(reached('paul').map((ids) => ids.toSorted())).toEqual([
        ['ego', 'ruby'],
      ]);
      expect(reached('theoDonor')).toEqual([['theo']]);
    });

    it(`seats the siblings who share a donor side by side, in the order added (${size}px symbols)`, () => {
      const { nodes, edges } = addedApart();
      const { centre } = drawAsInterface(nodes, edges, size);
      const order = ['ego', 'ruby', 'theo'].toSorted(
        (a, b) => centre(a).x - centre(b).x,
      );
      // Paul's children first, as the participant was added first, then
      // Theo; or the whole sibship the other way round.
      expect([order, order.toReversed()]).toContainEqual([
        'ego',
        'ruby',
        'theo',
      ]);
    });

    it(`seats each outer run’s donor on its run’s side (${size}px symbols)`, () => {
      const { nodes, edges } = threeDonors();
      const { centre } = drawAsInterface(nodes, edges, size);
      const side = (donorId: string, children: string[]) =>
        Math.sign(centre(donorId).x - centre('hannah').x) ===
        Math.sign(
          children.reduce((sum, id) => sum + centre(id).x, 0) /
            children.length -
            centre('hannah').x,
        );
      expect(side('paul', ['ego', 'ruby'])).toBe(true);
      expect(side('miaDonor', ['mia'])).toBe(true);
    });
  }
});
