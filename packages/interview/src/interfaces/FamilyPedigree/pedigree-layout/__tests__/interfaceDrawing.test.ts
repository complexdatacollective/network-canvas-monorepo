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
import { childAttachments, crossing, segmentsOf } from '../auxiliaryRouting';
import { FAMILY_PEDIGREE_GAPS } from '../layoutDimensions';
import { drawPedigree } from '../pedigreeAdapter';
import type {
  AuxiliaryConnector,
  LineSegment,
  PedigreeSymbolShape,
} from '../types';
import {
  CENTRE_CLEARANCE,
  childrenReachedBy,
  type Drawing,
  faultsOfCoParentDescents,
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

/** The shapes the codebook gives (circles and squares by sex), or everyone
 * drawn as a square. */
const SHAPE_SETS = [
  ['mixed shapes', undefined],
  ['all squares', 'square'],
] as const;

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
  /** Everyone drawn with this shape rather than the one their sex gives. */
  everyone?: PedigreeSymbolShape,
): Drawing {
  const family = readFamily(nodes, edges, config);
  const links = pedigreeLinksOf(family);
  const nodeIds = family.people.map((p) => p.id);
  const nodeShapes = new Map(
    family.people.map((p) => [
      p.id,
      everyone ??
        (resolveNodeShape(SHAPE, p.attributes) as PedigreeSymbolShape),
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

  /** drawingCoverage's "a sperm donor and a surrogate for two of three
   * half-siblings": Hannah's first two children were conceived with Paul
   * and carried by a surrogate, so two lines meet the one stem of their
   * run. */
  function donorAndSurrogate() {
    const nodes = [
      person('ego', { name: 'Maya', sex: ['male'], isEgo: true }),
      mother(),
      man('paul', 'Paul'),
      woman('carrier'),
      woman('ruby', 'Ruby'),
      man('theo', 'Theo'),
      man('theoDonor'),
    ];
    const edges = [
      ...['ego', 'ruby'].flatMap((child) => [
        link('hannah', child, 'biological', { carrier: false }),
        donor('paul', child),
        link('carrier', child, 'surrogate', { carrier: true }),
      ]),
      birth('theo'),
      donor('theoDonor', 'theo'),
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
    'a sperm donor and a surrogate for two of three half-siblings':
      donorAndSurrogate,
  };

  for (const size of SYMBOL_SIZES) {
    for (const [name, family] of Object.entries(families)) {
      for (const [shapes, everyone] of SHAPE_SETS) {
        it(`passes the strict line checks: ${name} (${shapes}, ${size}px symbols)`, () => {
          const { nodes, edges } = family();
          const drawing = drawAsInterface(nodes, edges, size, everyone);
          expect(
            strictLineFaults(drawing, helperTiesOf(edges), idsOf(nodes)),
          ).toEqual([]);
        });
      }
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

/**
 * The families of relatives who adopt a child: the child stays drawn in their
 * birth family, and the adopters' dashed line comes to them from elsewhere.
 */
function grandparentAdoption(adopters: ('margaret' | 'hugh')[]) {
  const nodes = [
    person('ego', { name: 'Ego', sex: ['female'], isEgo: true }),
    woman('margaret', 'Margaret'),
    man('hugh', 'Hugh'),
    man('ian', 'Ian'),
    woman('chloe', 'Chloe'),
    man('formerPartner', 'Former'),
  ];
  const edges = [
    link('margaret', 'ego', 'biological', { carrier: true }),
    link('hugh', 'ego', 'biological', { carrier: false }),
    link('margaret', 'hugh', 'partner', { current: true }),
    link('margaret', 'ian', 'biological', { carrier: true }),
    link('hugh', 'ian', 'biological', { carrier: false }),
    link('ego', 'chloe', 'biological', { carrier: true }),
    link('formerPartner', 'chloe', 'biological', { carrier: false }),
    link('ego', 'formerPartner', 'partner', { current: false }),
    ...adopters.map((id) => link(id, 'chloe', 'adoptive', { carrier: false })),
  ];
  return { nodes, edges };
}

/** A married older brother and his wife, with a son of their own, adopt his
 * younger sister. */
function siblingAdoption() {
  const nodes = [
    person('ego', { name: 'Ego', sex: ['female'], isEgo: true }),
    woman('mum', 'Mum'),
    man('dad', 'Dad'),
    man('tom', 'Tom'),
    woman('pat', 'Pat'),
    woman('sis', 'Sis'),
    man('kid', 'Kid'),
  ];
  const edges = [
    link('mum', 'dad', 'partner', { current: true }),
    ...['ego', 'tom', 'sis'].flatMap((child) => [
      link('mum', child, 'biological', { carrier: true }),
      link('dad', child, 'biological', { carrier: false }),
    ]),
    link('tom', 'pat', 'partner', { current: true }),
    link('pat', 'kid', 'biological', { carrier: true }),
    link('tom', 'kid', 'biological', { carrier: false }),
    link('tom', 'sis', 'adoptive', { carrier: false }),
    link('pat', 'sis', 'adoptive', { carrier: false }),
  ];
  return { nodes, edges };
}

/** The participant's sister is adopted by their aunt and, when `uncle` is
 * her husband, by him too, or, when he is her brother, by the two of them
 * who are not partners. The aunt has no children of her own. */
function nieceAdoption(uncle: 'husband' | 'brother') {
  const nodes = [
    person('ego', { name: 'Ego', sex: ['female'], isEgo: true }),
    woman('gran', 'Gran'),
    man('grandad', 'Grandad'),
    woman('mum', 'Mum'),
    man('dad', 'Dad'),
    woman('aunt', 'Aunt'),
    man('uncle', 'Uncle'),
    woman('niece', 'Niece'),
  ];
  const edges = [
    link('gran', 'grandad', 'partner', { current: true }),
    ...['mum', 'aunt', ...(uncle === 'brother' ? ['uncle'] : [])].flatMap(
      (child) => [
        link('gran', child, 'biological', { carrier: true }),
        link('grandad', child, 'biological', { carrier: false }),
      ],
    ),
    link('mum', 'dad', 'partner', { current: true }),
    ...(uncle === 'husband'
      ? [link('aunt', 'uncle', 'partner', { current: true })]
      : []),
    ...['ego', 'niece'].flatMap((child) => [
      link('mum', child, 'biological', { carrier: true }),
      link('dad', child, 'biological', { carrier: false }),
    ]),
    link('aunt', 'niece', 'adoptive', { carrier: false }),
    link('uncle', 'niece', 'adoptive', { carrier: false }),
  ];
  return { nodes, edges };
}

const adoptiveLinesInto = (drawing: Drawing, childId: string) =>
  drawing.connectors.auxiliaryLines.filter(
    (line) => line.edgeType === 'adoptive' && line.endpointIds?.[1] === childId,
  );

/** The upright pieces of a couple's own line of descent, which drops from
 * their partnership line to their children. */
function stemOf(drawing: Drawing, a: string, b: string): LineSegment[] {
  const descent = drawing.connectors.parentChildLines.find(
    (line) =>
      line.parentLink.length > 0 &&
      [a, b].every((id) => line.parentIds?.includes(id)),
  );
  return (descent?.parentLink ?? []).filter(
    (piece) => Math.abs(piece.x1 - piece.x2) < 0.5,
  );
}

/** Whether a line leaves a couple's line of descent as a T: it starts on an
 * upright piece of it, below the couple's symbols and clear of the piece's
 * lower end, and runs off it level. */
function leavesStemAsT(
  line: AuxiliaryConnector,
  stem: LineSegment[],
  drawing: Drawing,
  partner: string,
) {
  const [start, next] = line.points;
  if (!start || !next) return false;
  const belowSymbols = drawing.centre(partner).y + drawing.size / 2;
  const onStem = stem.some(
    (piece) =>
      Math.abs(start.x - piece.x1) < 0.5 &&
      start.y > Math.max(Math.min(piece.y1, piece.y2), belowSymbols) &&
      start.y < Math.max(piece.y1, piece.y2) - 0.1 * drawing.size,
  );
  return (
    onStem &&
    Math.abs(next.y - start.y) < 0.5 &&
    Math.abs(next.x - start.x) > 0.5
  );
}

const expectAt = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  expect(p.x).toBeCloseTo(q.x, 5);
  expect(p.y).toBeCloseTo(q.y, 5);
};

const crossesSegment = (line: AuxiliaryConnector, segment: LineSegment) =>
  segmentsOf(line.points).some((piece) => crossing(piece, segment));

describe('a couple who adopt a relative’s child', () => {
  for (const size of SYMBOL_SIZES) {
    for (const [shapes, everyone] of SHAPE_SETS) {
      const label = `${shapes}, ${size}px symbols`;

      it(`draw one dashed line from their line of descent to a granddaughter, around her parents and uncrossed (${label})`, () => {
        const { nodes, edges } = grandparentAdoption(['margaret', 'hugh']);
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const lines = adoptiveLinesInto(drawing, 'chloe');
        expect(lines).toHaveLength(1);
        const stem = stemOf(drawing, 'margaret', 'hugh');
        expect(stem.length).toBeGreaterThan(0);
        expect(leavesStemAsT(lines[0]!, stem, drawing, 'margaret')).toBe(true);
        expect(faultsOfLinesInto(drawing, 'chloe')).toEqual([]);
        const formerPartnership = drawing.connectors.groupLines.find((line) =>
          ['ego', 'formerPartner'].every((id) => line.partnerIds?.includes(id)),
        )!;
        expect(crossesSegment(lines[0]!, formerPartnership.segment)).toBe(
          false,
        );
      });

      it(`draw one dashed line from their line of descent to a younger sister, uncrossed (${label})`, () => {
        const { nodes, edges } = siblingAdoption();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const lines = adoptiveLinesInto(drawing, 'sis');
        expect(lines).toHaveLength(1);
        const stem = stemOf(drawing, 'tom', 'pat');
        expect(stem.length).toBeGreaterThan(0);
        expect(leavesStemAsT(lines[0]!, stem, drawing, 'tom')).toBe(true);
        expect(faultsOfLinesInto(drawing, 'sis')).toEqual([]);
      });

      it(`with no children of their own draw one dashed line from the middle of their partnership line (${label})`, () => {
        const { nodes, edges } = nieceAdoption('husband');
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const lines = adoptiveLinesInto(drawing, 'niece');
        expect(lines).toHaveLength(1);
        const [aunt, uncle] = [drawing.centre('aunt'), drawing.centre('uncle')];
        const [start] = lines[0]!.points;
        expect(start!.x).toBeCloseTo((aunt.x + uncle.x) / 2, 5);
        expect(start!.y).toBeCloseTo(aunt.y, 5);
        expect(faultsOfLinesInto(drawing, 'niece')).toEqual([]);
      });
    }
  }
});

describe('relatives who adopt a child without a partner who adopts too', () => {
  for (const size of SYMBOL_SIZES) {
    for (const [shapes, everyone] of SHAPE_SETS) {
      const label = `${shapes}, ${size}px symbols`;

      it(`a lone grandparent keeps a dashed line of her own (${label})`, () => {
        const { nodes, edges } = grandparentAdoption(['margaret']);
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const lines = adoptiveLinesInto(drawing, 'chloe');
        expect(lines).toHaveLength(1);
        expect(lines[0]!.endpointIds?.[0]).toBe('margaret');
        expectAt(lines[0]!.points[0]!, drawing.centre('margaret'));
      });

      it(`an aunt and uncle who are not partners keep a dashed line each (${label})`, () => {
        const { nodes, edges } = nieceAdoption('brother');
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const lines = adoptiveLinesInto(drawing, 'niece');
        expect(
          lines
            .map((line) => line.endpointIds?.[0] ?? '')
            .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(['aunt', 'uncle']);
        for (const line of lines) {
          expectAt(line.points[0]!, drawing.centre(line.endpointIds![0]!));
        }
      });
    }
  }
});

/**
 * Co-parents never recorded as partners: a birth mother and the unnamed
 * stand-in for the father, with one child or two.
 */
function standInFamily(children: ('ego' | 'sib')[]) {
  const nodes = [
    person('ego', { name: 'Maya', sex: ['female'], isEgo: true }),
    woman('mum', 'Ana'),
    man('standIn'),
    ...(children.includes('sib') ? [man('sib', 'Leo')] : []),
  ];
  const edges = children.flatMap((child) => [
    link('mum', child, 'biological', { carrier: true }),
    link('standIn', child, 'biological', { carrier: false }),
  ]);
  return { nodes, edges };
}

describe('co-parents with no recorded partnership', () => {
  for (const size of SYMBOL_SIZES) {
    for (const [shapes, everyone] of SHAPE_SETS) {
      const label = `${shapes}, ${size}px symbols`;
      for (const [count, children] of [
        ['one child', ['ego']],
        ['two children', ['ego', 'sib']],
      ] as const) {
        it(`draw a line down from each of them, joined into one before the ${count === 'one child' ? 'child' : 'sibling bar'} (${count}, ${label})`, () => {
          const { nodes, edges } = standInFamily([...children]);
          const drawing = drawAsInterface(nodes, edges, size, everyone);
          expect(faultsOfCoParentDescents(drawing)).toEqual([]);
          const [descent] = drawing.connectors.parentChildLines.filter(
            (line) =>
              line.parentLink.length > 0 &&
              line.uplineChildIds?.includes('ego'),
          );
          // Nothing starts midway between them, where the line of descent
          // dropped from before (round 2).
          const [mum, standIn] = [
            drawing.centre('mum'),
            drawing.centre('standIn'),
          ];
          const midway = { x: (mum.x + standIn.x) / 2, y: mum.y };
          for (const piece of descent!.parentLink) {
            for (const end of [
              { x: piece.x1, y: piece.y1 },
              { x: piece.x2, y: piece.y2 },
            ]) {
              expect(
                Math.hypot(end.x - midway.x, end.y - midway.y),
              ).toBeGreaterThan(size / 2);
            }
          }
          expect(
            strictLineFaults(drawing, helperTiesOf(edges), idsOf(nodes)),
          ).toEqual([]);
        });
      }
    }
  }
});

/**
 * drawingCoverage's "step parents and adoptive parents who separated": the
 * participant's birth parents Shannon and an unnamed father, who were never
 * partners; Karen and Mike, who adopted them and separated; Denise, Karen's
 * partner, and Lauren, Mike's partner, who each raise them; and Jack, Mike
 * and Lauren's son.
 */
function sixParents() {
  const nodes = [
    person('ego', { name: 'Ego', sex: ['male'], isEgo: true }),
    woman('karen', 'Karen'),
    man('mike', 'Mike'),
    woman('shannon', 'Shannon'),
    man('egoFather'),
    woman('lauren', 'Lauren'),
    woman('denise', 'Denise'),
    man('jack', 'Jack'),
  ];
  const edges = [
    link('egoFather', 'ego', 'biological', { carrier: false }),
    link('karen', 'ego', 'adoptive', { carrier: false }),
    link('mike', 'ego', 'adoptive', { carrier: false }),
    link('karen', 'mike', 'partner', { current: false }),
    link('shannon', 'ego', 'biological', { carrier: true }),
    link('mike', 'lauren', 'partner', { current: true }),
    link('lauren', 'ego', 'social', { carrier: false }),
    link('karen', 'denise', 'partner', { current: true }),
    link('denise', 'ego', 'social', { carrier: false }),
    link('mike', 'jack', 'biological', { carrier: false }),
    link('lauren', 'jack', 'biological', { carrier: true }),
  ];
  return { nodes, edges };
}

describe('a participant with birth parents, separated adoptive parents and their partners', () => {
  const linesFrom = (drawing: Drawing, parent: string) =>
    drawing.connectors.auxiliaryLines.filter(
      (line) => line.endpointIds?.[0] === parent,
    );
  const segmentsOfLine = (line: AuxiliaryConnector) => segmentsOf(line.points);
  const sharesPiece = (a: LineSegment[], b: LineSegment[]) =>
    a.some((s) =>
      b.some(
        (t) =>
          Math.hypot(s.x1 - t.x1, s.y1 - t.y1) < 0.5 &&
          Math.hypot(s.x2 - t.x2, s.y2 - t.y2) < 0.5,
      ),
    );

  for (const size of SYMBOL_SIZES) {
    for (const [shapes, everyone] of SHAPE_SETS) {
      const label = `${shapes}, ${size}px symbols`;

      it(`seats the birth father beside Shannon (${label})`, () => {
        const { nodes, edges } = sixParents();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const row = [
          'shannon',
          'egoFather',
          'denise',
          'karen',
          'mike',
          'lauren',
        ]
          .map((id) => ({ id, x: drawing.centre(id).x }))
          .toSorted((a, b) => a.x - b.x)
          .map(({ id }) => id);
        expect(
          Math.abs(row.indexOf('shannon') - row.indexOf('egoFather')),
        ).toBe(1);
      });

      it(`draws the birth parents' lines down from each of them, joined into one solid line before the participant (${label})`, () => {
        const { nodes, edges } = sixParents();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const [shannon] = linesFrom(drawing, 'shannon');
        const [father] = linesFrom(drawing, 'egoFather');
        expect(linesFrom(drawing, 'shannon')).toHaveLength(1);
        expect(linesFrom(drawing, 'egoFather')).toHaveLength(1);
        for (const [line, id] of [
          [shannon!, 'shannon'],
          [father!, 'egoFather'],
        ] as const) {
          expect(line.endpointIds?.[1]).toBe('ego');
          expect(line.edgeType).toBe('donor');
          expectAt(line.points[0]!, drawing.centre(id));
          // Straight down out of the parent's own symbol.
          expect(line.points[1]!.x).toBeCloseTo(line.points[0]!.x, 5);
          expect(line.points[1]!.y).toBeGreaterThan(
            drawing.centre(id).y + size / 2,
          );
        }
        // One line from where they join to the participant.
        const tail = (line: AuxiliaryConnector) => line.points.slice(-2);
        expect(tail(shannon!)).toEqual(tail(father!));
      });

      it(`draws a separate line from each social parent into the participant, joined to no other line (${label})`, () => {
        const { nodes, edges } = sixParents();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const adoptive = drawing.connectors.parentChildLines
          .filter((line) => line.uplineChildIds?.includes('ego'))
          .flatMap((line) => [...line.parentLink, ...line.uplines]);
        for (const id of ['denise', 'lauren']) {
          const lines = linesFrom(drawing, id);
          expect(lines, id).toHaveLength(1);
          expect(lines[0]!.edgeType).toBe('social');
          expect(lines[0]!.endpointIds?.[1]).toBe('ego');
          expectAt(lines[0]!.points[0]!, drawing.centre(id));
          expect(sharesPiece(segmentsOfLine(lines[0]!), adoptive)).toBe(false);
          for (const other of drawing.connectors.auxiliaryLines) {
            if (other === lines[0]) continue;
            expect(
              sharesPiece(segmentsOfLine(lines[0]!), segmentsOfLine(other)),
              `${id} and ${other.endpointIds?.[0]}`,
            ).toBe(false);
          }
        }
      });

      it(`ends the lines on the participant's top in their parents' left-to-right order (${label})`, () => {
        const { nodes, edges } = sixParents();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const ego = drawing.centre('ego');
        const endX = (line: AuxiliaryConnector) =>
          line.points.find(
            (p) =>
              Math.abs(p.y - (ego.y - size / 2)) < size * 0.3 &&
              Math.abs(p.x - ego.x) < size / 2,
          )?.x ?? line.points.at(-1)!.x;
        const birth = endX(linesFrom(drawing, 'shannon')[0]!);
        const denise = endX(linesFrom(drawing, 'denise')[0]!);
        const lauren = endX(linesFrom(drawing, 'lauren')[0]!);
        expect(birth).toBeLessThan(denise);
        expect(denise).toBeLessThan(ego.x);
        expect(lauren).toBeGreaterThan(ego.x);
      });

      it(`crosses only once, where Lauren's line hops the line down to Jack (${label})`, () => {
        const { nodes, edges } = sixParents();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const hops = drawing.connectors.auxiliaryLines.flatMap((line) =>
          (line.hops ?? []).map((hop) => ({ id: line.endpointIds?.[0], hop })),
        );
        expect(hops.map(({ id }) => id)).toEqual(['lauren']);
        const toJack = drawing.connectors.parentChildLines
          .filter((line) => line.uplineChildIds?.includes('jack'))
          .flatMap((line) => [...line.parentLink, ...line.uplines]);
        expect(
          toJack.some(
            (piece) =>
              Math.abs(piece.x1 - piece.x2) < 0.5 &&
              Math.abs(piece.x1 - hops[0]!.hop.x) < 0.75 &&
              hops[0]!.hop.y >= Math.min(piece.y1, piece.y2) &&
              hops[0]!.hop.y <= Math.max(piece.y1, piece.y2),
          ),
        ).toBe(true);
      });

      it(`still finds any other hop a fault (${label})`, () => {
        const { nodes, edges } = sixParents();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        const withHop = (id: string, hop: { x: number; y: number }) => ({
          ...drawing,
          connectors: {
            ...drawing.connectors,
            auxiliaryLines: drawing.connectors.auxiliaryLines.map((line) =>
              line.endpointIds?.[0] === id
                ? { ...line, hops: [...(line.hops ?? []), hop] }
                : line,
            ),
          },
        });
        const [denise] = linesFrom(drawing, 'denise');
        const [lauren] = linesFrom(drawing, 'lauren');
        // Denise's line hops nothing it cannot avoid: anywhere along it.
        const middle = segmentsOf(denise!.points)[1]!;
        expect(
          faultsOfLinesInto(
            withHop('denise', {
              x: (middle.x1 + middle.x2) / 2,
              y: (middle.y1 + middle.y2) / 2,
            }),
            'ego',
          ),
        ).toContain("denise's social line crosses a line");
        // A second hop on Lauren's line, or her one hop moved off the line
        // down to Jack, is a fault too.
        const ego = drawing.centre('ego');
        expect(
          faultsOfLinesInto(
            withHop('lauren', { x: ego.x + size, y: lauren!.hops![0]!.y }),
            'ego',
          ),
        ).toContain("lauren's social line crosses a line");
        const moved = {
          ...drawing,
          connectors: {
            ...drawing.connectors,
            auxiliaryLines: drawing.connectors.auxiliaryLines.map((line) =>
              line === lauren
                ? { ...line, hops: [{ x: ego.x + size, y: line.hops![0]!.y }] }
                : line,
            ),
          },
        };
        expect(faultsOfLinesInto(moved, 'ego')).toContain(
          "lauren's social line crosses a line",
        );
        // The hop is accepted for a social parent's line only: an adoptive
        // line making the same crossing is a fault.
        const adoptive = {
          ...drawing,
          connectors: {
            ...drawing.connectors,
            auxiliaryLines: drawing.connectors.auxiliaryLines.map((line) =>
              line === lauren
                ? { ...line, edgeType: 'adoptive' as const }
                : line,
            ),
          },
        };
        expect(faultsOfLinesInto(adoptive, 'ego')).toContain(
          "lauren's adoptive line crosses a line",
        );
      });

      it(`passes the strict line checks (${label})`, () => {
        const { nodes, edges } = sixParents();
        const drawing = drawAsInterface(nodes, edges, size, everyone);
        expect(
          strictLineFaults(drawing, helperTiesOf(edges), idsOf(nodes)),
        ).toEqual([]);
      });
    }
  }
});

/**
 * An adopted child's birth parents who were never partners, Chloe and
 * Tyler, one of whom has a partner of her own, Sam; Helen and Mark adopted
 * the child. Recorded in either order.
 */
function birthParentWithPartner(order: ('chloe' | 'tyler')[]) {
  const nodes = [
    person('ego', { name: 'Ego', sex: ['female'], isEgo: true }),
    woman('helen', 'Helen'),
    man('mark', 'Mark'),
    ...order.map((id) =>
      id === 'chloe' ? woman('chloe', 'Chloe') : man('tyler', 'Tyler'),
    ),
    man('sam', 'Sam'),
  ];
  const edges = [
    link('helen', 'mark', 'partner', { current: true }),
    link('helen', 'ego', 'adoptive', { carrier: false }),
    link('mark', 'ego', 'adoptive', { carrier: false }),
    ...order.map((id) =>
      link(id, 'ego', 'biological', { carrier: id === 'chloe' }),
    ),
    link('chloe', 'sam', 'partner', { current: true }),
  ];
  return { nodes, edges };
}

describe('an adopted child’s birth parents who were never partners, one with a partner', () => {
  for (const size of SYMBOL_SIZES) {
    for (const order of [
      ['chloe', 'tyler'],
      ['tyler', 'chloe'],
    ] as ('chloe' | 'tyler')[][]) {
      const label = `${order.join(' first, then ')}, ${size}px symbols`;

      it(`seats the birth parent beside her partner and the other birth parent (${label})`, () => {
        const { nodes, edges } = birthParentWithPartner(order);
        const drawing = drawAsInterface(nodes, edges, size);
        const row = ['helen', 'mark', 'chloe', 'tyler', 'sam'].toSorted(
          (a, b) => drawing.centre(a).x - drawing.centre(b).x,
        );
        const apart = (a: string, b: string) =>
          Math.abs(row.indexOf(a) - row.indexOf(b));
        expect(apart('chloe', 'sam')).toBe(1);
        expect(apart('chloe', 'tyler')).toBe(1);
        expect(Math.min(apart('tyler', 'helen'), apart('tyler', 'mark'))).toBe(
          1,
        );
        const partnership = drawing.connectors.groupLines.find((line) =>
          ['chloe', 'sam'].every((id) => line.partnerIds?.includes(id)),
        );
        expect(partnership?.endpointSegments ?? []).toEqual([]);
      });

      it(`draws their lines down from each of them, joined before the child (${label})`, () => {
        const { nodes, edges } = birthParentWithPartner(order);
        const drawing = drawAsInterface(nodes, edges, size);
        const tail = (id: string) =>
          drawing.connectors.auxiliaryLines
            .find((line) => line.endpointIds?.[0] === id)!
            .points.slice(-2);
        expect(tail('chloe')).toEqual(tail('tyler'));
        expect(
          strictLineFaults(drawing, helperTiesOf(edges), idsOf(nodes)),
        ).toEqual([]);
      });
    }
  }
});
