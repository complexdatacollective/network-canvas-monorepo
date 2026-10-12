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

const SHAPE_SETS = [
  ['mixed shapes', undefined],
  ['all squares', 'square'],
] as const;

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
