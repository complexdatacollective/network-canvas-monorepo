/**
 * The drawing accounts for every recorded tie: each parent tie is drawn by a
 * line of descent, a line of its own, a couple's line (from their partnership
 * line, or from their own line of descent) or a line to the sibship's bar;
 * each partnership by a partnership line; each pair of twins by a twin mark;
 * and every line lies inside the drawing, clear of the former-partner
 * break.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formerPartnerBreak } from '../components/EdgeRenderer';
import PedigreeLayout from '../components/PedigreeLayout';
import { computeConnectors } from '../connectors';
import { EDGE_WIDTH, type LayoutDimensions } from '../layoutDimensions';
import { drawPedigree } from '../pedigreeAdapter';
import type {
  LineSegment,
  ParentConnection,
  ParentGroupConnector,
  PedigreeConnectors,
  PedigreeLayout as Layout,
  PedigreeLink,
  PedigreeSymbolShape,
  Point,
} from '../types';
import { coverageFamilies as families } from './coverageFamilies';
import { coordinates, drawnMarks, markPlaces } from './drawnMarks';
import { INTERFACE_DIMENSIONS } from './fixtures';
import { lineEndFaults } from './lineEnds';
import {
  type Drawing,
  familyOf,
  hopCount,
  strictLineFaults,
} from './lineFaults';

const DIMENSIONS: LayoutDimensions = INTERFACE_DIMENSIONS;

/** Everyone drawn with one shape, as the interface draws every person with
 * the shape their codebook gives them. */
function draw(
  people: string[],
  links: PedigreeLink[],
  shape: PedigreeSymbolShape = 'circle',
  size = DIMENSIONS.nodeWidth,
) {
  const dimensions = { ...DIMENSIONS, nodeWidth: size, nodeHeight: size };
  const { positions: topLeft, connectorData } = drawPedigree({
    nodeIds: people,
    links,
    dimensions,
    nodeNames: new Map(people.map((id) => [id, id])),
    nodeShapes: new Map(people.map((id) => [id, shape])),
  });
  const { connectors } = connectorData;
  const centre = (personId: string): Point => {
    const position = topLeft.get(personId);
    if (!position) throw new Error(`${personId} is not drawn`);
    return { x: position.x + size / 2, y: position.y + size / 2 };
  };
  const drawing: Drawing = {
    size,
    connectors,
    centre,
    shapeOf: () => shape,
  };
  return { connectors, centre, drawing, family: familyOf(people, links) };
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.5;
const length = (points: Point[]) =>
  points
    .slice(1)
    .reduce(
      (total, p, k) =>
        total + Math.hypot(p.x - points[k]!.x, p.y - points[k]!.y),
      0,
    );
const onSegment = (p: Point, s: LineSegment) =>
  close(p.y, s.y1) &&
  close(p.y, s.y2) &&
  p.x >= Math.min(s.x1, s.x2) - 0.5 &&
  p.x <= Math.max(s.x1, s.x2) + 0.5;

const distanceTo = (p: Point, s: LineSegment) => {
  const [dx, dy] = [s.x2 - s.x1, s.y2 - s.y1];
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / length2),
        );
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
};

/** Every recorded tie the drawing does not account for. */
function unaccounted(
  links: PedigreeLink[],
  connectors: PedigreeConnectors,
  centre: (id: string) => Point,
): string[] {
  const faults: string[] = [];
  const aux = connectors.auxiliaryLines;
  for (const line of aux) {
    if (line.points.length < 2 || length(line.points) < 1) {
      faults.push(`${line.endpointIds?.join('→')} draws nothing`);
    }
  }
  const same = (a: (string | undefined)[] = [], b: string[]) =>
    a.length === b.length && b.every((id) => a.includes(id));

  const coveredTie = (p: string, c: string) => {
    // A line of its own.
    if (aux.some((l) => l.endpointIds?.[0] === p && l.endpointIds[1] === c)) {
      return true;
    }
    // A couple's line, from midway along their partnership line.
    if (
      aux.some((l) => {
        const [q, child] = l.endpointIds ?? [];
        if (child !== c || q === undefined || q === p) return false;
        if (!connectors.groupLines.some((g) => same(g.partnerIds, [p, q]))) {
          return false;
        }
        const start = l.points[0]!;
        return (
          close(start.x, (centre(p).x + centre(q).x) / 2) &&
          close(start.y, centre(p).y)
        );
      })
    ) {
      return true;
    }
    // A couple's line to a relative's child they raise, leaving the couple's
    // own line of descent: it starts on an upright piece of the line that
    // drops from the couple's partnership line to their children.
    if (
      aux.some((l) => {
        const [q, child] = l.endpointIds ?? [];
        if (child !== c || q === undefined || q === p) return false;
        const partnership = connectors.groupLines.find((g) =>
          same(g.partnerIds, [p, q]),
        );
        if (!partnership) return false;
        const start = l.points[0]!;
        return connectors.parentChildLines.some((pc) => {
          const [top] = pc.parentLink;
          if (!top || !same(pc.parentIds, [p, q])) return false;
          if (!onSegment({ x: top.x1, y: top.y1 }, partnership.segment)) {
            if (
              !partnership.doubleSegment ||
              !onSegment({ x: top.x1, y: top.y1 }, partnership.doubleSegment)
            ) {
              return false;
            }
          }
          return pc.parentLink.some(
            (piece) =>
              close(piece.x1, piece.x2) &&
              close(start.x, piece.x1) &&
              start.y > Math.min(piece.y1, piece.y2) + 0.5 &&
              start.y < Math.max(piece.y1, piece.y2) - 0.5,
          );
        });
      })
    ) {
      return true;
    }
    const sibship = connectors.parentChildLines.filter((pc) =>
      pc.uplineChildIds?.includes(c),
    );
    // The line of descent from the parent (for co-parents with no
    // partnership line, a line down from each of them), or from the
    // parent's couple: from their partnership line (either rail of a double
    // one, or a line routed above their row).
    for (const pc of sibship) {
      const [top] = pc.parentLink;
      if (!top || !pc.parentIds?.includes(p)) continue;
      if (
        pc.parentLink.some(
          (piece) =>
            close(piece.x1, centre(p).x) && close(piece.y1, centre(p).y),
        )
      ) {
        return true;
      }
      const start = { x: top.x1, y: top.y1 };
      if (
        pc.parentIds.some(
          (q) =>
            q !== p &&
            connectors.groupLines.some(
              (g) =>
                same(g.partnerIds, [p, q]) &&
                [g.segment, ...(g.doubleSegment ? [g.doubleSegment] : [])].some(
                  (rail) => onSegment(start, rail),
                ),
            ),
        )
      ) {
        return true;
      }
    }
    // A line to the child's sibship: onto its bar, or onto the point the
    // twins of a sibship of twins hang from.
    const childTop = sibship
      .flatMap((pc) =>
        pc.uplines.filter((_, k) => pc.uplineChildIds?.[k] === c),
      )
      .map((upline) => ({ x: upline.x2, y: upline.y2 }))[0];
    if (!childTop) return false;
    const bars = connectors.parentChildLines.flatMap((pc) => [
      ...(pc.siblingBar ? [pc.siblingBar] : []),
      ...pc.uplines.map(
        (u) =>
          ({
            type: 'line',
            x1: u.x2,
            y1: u.y2,
            x2: u.x2,
            y2: u.y2,
          }) satisfies LineSegment,
      ),
    ]);
    // Or, for a donor or surrogate of some of the sibship (the donor and
    // carrier line rule, 12 Oct 2026), where the line of descent first leads
    // only to their children: the top of the stem of a run the child is in,
    // or, for an only child, the top of the child, on their own line up.
    const ownUpline = sibship.flatMap((pc) =>
      pc.uplines.filter((_, k) => pc.uplineChildIds?.[k] === c),
    )[0]!;
    // The stems of the runs the child is in: the one they hang from, the
    // one that run hangs from in turn (a run inside another), and so on up.
    const runs = sibship.flatMap((pc) => pc.runs ?? []);
    const stems: LineSegment[] = [];
    for (let top: Point | undefined = childTop; top;) {
      const at: Point = top;
      const run = runs.find((candidate) =>
        candidate.bar
          ? onSegment(at, candidate.bar)
          : close(at.x, candidate.stem.x2) && close(at.y, candidate.stem.y2),
      );
      top = run ? { x: run.stem.x1, y: run.stem.y1 } : undefined;
      if (run) stems.push(run.stem);
    }
    const strictlyWithin = (point: Point, s: LineSegment) =>
      distanceTo(point, s) < 0.5 &&
      Math.min(
        Math.hypot(point.x - s.x1, point.y - s.y1),
        Math.hypot(point.x - s.x2, point.y - s.y2),
      ) > 0.5;
    // (A couple's line joins a line of descent for both of them: the
    // carrier's, when someone else carried the couple's children.)
    return aux.some((l) => {
      const owners = l.ownerIds ?? [l.endpointIds?.[0]];
      if (!owners.includes(p) || l.endpointIds?.[1] !== undefined) {
        return false;
      }
      const end = l.points.at(-1)!;
      return (
        (close(end.y, childTop.y) && bars.some((bar) => onSegment(end, bar))) ||
        stems.some((stem) => close(end.x, stem.x1) && close(end.y, stem.y1)) ||
        (sibship.flatMap((pc) => pc.uplineChildIds ?? []).length === 1 &&
          strictlyWithin(end, ownUpline))
      );
    });
  };

  for (const link of links) {
    const { source, target, kind } = link;
    if (kind === 'partner') {
      if (
        !connectors.groupLines.some((g) => same(g.partnerIds, [source, target]))
      ) {
        faults.push(`partnership ${source}–${target} is not drawn`);
      }
    } else if (kind.endsWith('Twin')) {
      if (
        !connectors.twinIndicators.some((t) =>
          same(t.twinIds, [source, target]),
        )
      ) {
        faults.push(`twins ${source}, ${target} are not marked`);
      }
    } else if (!coveredTie(source, target)) {
      faults.push(`${kind} tie ${source}→${target} is not drawn`);
    }
  }
  return faults;
}

describe('the drawing accounts for every recorded tie', () => {
  for (const [name, { people, links }] of Object.entries(families)) {
    for (const shape of ['circle', 'square'] as const) {
      it(`${name} (${shape}s)`, () => {
        const { connectors, centre } = draw(people, links, shape);
        expect(unaccounted(links, connectors, centre)).toEqual([]);
      });
    }
  }

  it('reports a tie that is not drawn', () => {
    // Co-parents' shared children descend from a line down from each of
    // them, joined below their row: that one line accounts for both
    // parents' ties, and moving it, or dropping it from midway between them
    // instead (the round 2 drawing), accounts for neither.
    {
      const { people, links } = families['co-parents who were never partners']!;
      const { connectors, centre } = draw(people, links);
      const [ann, bob] = [centre('ann'), centre('bob')];
      const fromMidway = {
        ...connectors,
        parentChildLines: connectors.parentChildLines.map((line) =>
          line.parentLink.length === 0
            ? line
            : {
                ...line,
                parentLink: [
                  {
                    type: 'line',
                    x1: (ann.x + bob.x) / 2,
                    y1: ann.y,
                    x2: (ann.x + bob.x) / 2,
                    y2: line.siblingBar!.y1,
                  } satisfies LineSegment,
                ],
              },
        ),
      };
      expect(unaccounted(links, fromMidway, centre)).toEqual([
        'biological tie ann→ego is not drawn',
        'biological tie bob→ego is not drawn',
        'biological tie ann→sib is not drawn',
        'biological tie bob→sib is not drawn',
      ]);
      const moved = {
        ...connectors,
        parentChildLines: connectors.parentChildLines.map((line) => ({
          ...line,
          parentLink: line.parentLink.map((segment) => ({
            ...segment,
            x1: segment.x1 + 20,
            x2: segment.x2 + 20,
          })),
        })),
      };
      expect(unaccounted(links, moved, centre)).toEqual([
        'biological tie ann→ego is not drawn',
        'biological tie bob→ego is not drawn',
        'biological tie ann→sib is not drawn',
        'biological tie bob→sib is not drawn',
      ]);
    }
    // A donor to some of a sibship is accounted for by their line onto the
    // stem of those children's run: taken away, or moved onto another
    // child's line up, it accounts for neither child.
    {
      const { people, links } =
        families['a donor to two of three half-siblings']!;
      const { connectors, centre } = draw(people, links);
      const without = {
        ...connectors,
        auxiliaryLines: connectors.auxiliaryLines.filter(
          (line) => line.endpointIds?.[0] !== 'paul',
        ),
      };
      const notDrawn = [
        'donor tie paul→ego is not drawn',
        'donor tie paul→ruby is not drawn',
      ];
      expect(unaccounted(links, without, centre)).toEqual(notDrawn);
      const theo = connectors.parentChildLines.flatMap((pc) =>
        pc.uplines.filter((_, k) => pc.uplineChildIds?.[k] === 'theo'),
      )[0]!;
      const moved = {
        ...connectors,
        auxiliaryLines: connectors.auxiliaryLines.map((line) =>
          line.endpointIds?.[0] === 'paul'
            ? {
                ...line,
                points: [
                  ...line.points.slice(0, -1),
                  { x: theo.x2, y: (theo.y2 + centre('theo').y) / 2 - 20 },
                ],
              }
            : line,
        ),
      };
      expect(unaccounted(links, moved, centre)).toEqual(notDrawn);
    }
    // A couple's line to a relative's child they adopt accounts for both
    // their ties from their own line of descent, and for only the tie of the
    // partner it is named after once it starts anywhere else.
    {
      const { people, links } =
        families[
          'a granddaughter adopted by her grandparents, with a former partner'
        ]!;
      const { connectors, centre } = draw(people, links);
      const offStem = {
        ...connectors,
        auxiliaryLines: connectors.auxiliaryLines.map((line) => ({
          ...line,
          points: [
            { x: line.points[0]!.x + 20, y: line.points[0]!.y },
            ...line.points.slice(1),
          ],
        })),
      };
      expect(unaccounted(links, offStem, centre)).toEqual([
        'adoptive tie hugh→chloe is not drawn',
      ]);
    }
    const { people, links } = families['a step parent and a donor']!;
    const { connectors, centre } = draw(people, links);
    const without = {
      ...connectors,
      auxiliaryLines: connectors.auxiliaryLines.filter(
        (line) => line.endpointIds?.[0] !== 'tom',
      ),
    };
    expect(unaccounted(links, without, centre)).toEqual([
      'donor tie tom→ego is not drawn',
    ]);
    const collapsed = {
      ...connectors,
      auxiliaryLines: connectors.auxiliaryLines.map((line) => ({
        ...line,
        points: line.points.slice(0, 1),
      })),
    };
    expect(unaccounted(links, collapsed, centre)).toContain(
      'jo→ego draws nothing',
    );
  });
});

describe('the lines pass the strict line checks', () => {
  for (const [name, { people, links }] of Object.entries(families)) {
    for (const shape of ['circle', 'square'] as const) {
      it(`${name} (${shape}s)`, () => {
        const { drawing, family } = draw(people, links, shape);
        expect(strictLineFaults(drawing, family)).toEqual([]);
      });
    }
  }
});

/**
 * Every crossing is drawn as a hop, and how many there are is a cost, not
 * a fault: each family's count is pinned at the fewest found, so a change
 * that adds one shows here. Families not listed cross nothing.
 */
const HOPS: Record<string, number> = {
  // Lauren's line hops the line down to Jack.
  'step parents and adoptive parents who separated': 1,
  // Hannah's lines run as one course to below the sibling bar, where her
  // line to Ruby parts and hops the participant's line up.
  'an egg donor, a sperm donor and a surrogate for two of three children Hannah raises': 1,
  // Paul's lines run as one course from him and part as a fork; his line
  // to the participant hops Hannah's line of descent.
  'a surrogate for one of a donor’s two children, the other recorded first': 1,
  // The birth parents' line to the participant hops their sibling's line
  // up: the two parents' lines run as one there, drawn once, with one hop.
  'two siblings adopted together, with the same birth parents': 1,
  // The stepfather's lines run as one course to below the sibling bar,
  // where his line to the participant parts and hops their sibling's line
  // up.
  'a stepfather who raises all his partner’s children': 1,
  // Young's line of descent hops the sibling bar of the parents it comes
  // from, and Jo's social line to Cal: the fewest found within the work
  // allowed (a search without that bound finds a drawing with one).
  'a woman who carries her parents’ child and raises a friend’s': 2,
};

describe('the lines cross no more often than the fewest crossings found', () => {
  for (const [name, { people, links }] of Object.entries(families)) {
    for (const shape of ['circle', 'square'] as const) {
      it(`hops: ${name} (${shape}s)`, () => {
        const { connectors } = draw(people, links, shape);
        expect(hopCount(connectors)).toBe(HOPS[name] ?? 0);
      });
    }
  }
});

describe('the drawing draws no partnership that was not recorded', () => {
  for (const [name, { people, links }] of Object.entries(families)) {
    it(name, () => {
      const { connectors } = draw(people, links);
      const recorded = links
        .filter((link) => link.kind === 'partner')
        .map((link) => [link.source, link.target].toSorted().join(' and '));
      const drawn = connectors.groupLines.map((line) =>
        [...(line.partnerIds ?? [])].toSorted().join(' and '),
      );
      expect(drawn.filter((pair) => !recorded.includes(pair))).toEqual([]);
    });
  }
});

/** The numbers in an SVG points list or path. */

describe('a former partnership’s break', () => {
  for (const [name, { people, links }] of Object.entries(families)) {
    it(`knows every line crossing the partnership line: ${name}`, () => {
      const { connectors } = draw(people, links);
      for (const line of connectors.groupLines.filter((g) => !g.isActive)) {
        const { x1, x2, y1: y } = line.segment;
        const crossings = connectors.auxiliaryLines.flatMap((aux) =>
          aux.points.slice(1).flatMap((p, k) => {
            const a = aux.points[k]!;
            if ((a.y - y) * (p.y - y) > 0 || a.y === p.y) return [];
            const x = a.x + ((y - a.y) / (p.y - a.y)) * (p.x - a.x);
            return x > Math.min(x1, x2) && x < Math.max(x1, x2) ? [x] : [];
          }),
        );
        for (const x of crossings) {
          expect(
            (line.auxiliaryXPositions ?? []).some((known) => close(known, x)),
          ).toBe(true);
        }
      }
    });
  }
});

it('records where a line leaves a former partnership line', () => {
  // Former partners who both raise a child they did not have together: one
  // line comes down to the child from midway along their partnership line.
  const layout: Layout = {
    n: [2, 1],
    nid: [
      [0, 1],
      [2, 0],
    ],
    pos: [
      [0, 2],
      [1, 0],
    ],
    fam: [
      [0, 0],
      [0, 0],
    ],
    group: [
      [1, 0],
      [0, 0],
    ],
    twins: null,
    groupMember: [
      [false, false],
      [false, false],
    ],
  };
  const parents: ParentConnection[][] = [
    [],
    [],
    [
      { parentIndex: 0, edgeType: 'social' },
      { parentIndex: 1, edgeType: 'social' },
    ],
  ];
  const connectors = computeConnectors(
    layout,
    { boxWidth: 0.4, boxHeight: 0.4, legHeight: 0.3, hScale: 1, vScale: 1 },
    parents,
    new Set(),
    undefined,
    undefined,
    undefined,
    ['ann', 'bob', 'child'],
    new Set(['0,1']),
  );
  const former = connectors.groupLines.find((line) => !line.isActive)!;
  expect(connectors.auxiliaryLines).toHaveLength(1);
  const [start] = connectors.auxiliaryLines[0]!.points;
  expect(start).toEqual({ x: 1, y: former.segment.y1 });
  expect(former.auxiliaryXPositions).toEqual([1]);
});

describe('every line lies inside the drawing', () => {
  for (const [name, { people, links }] of Object.entries(families)) {
    it(name, () => {
      const { container } = render(
        <PedigreeLayout
          nodeIds={people}
          links={links}
          nodeWidth={DIMENSIONS.nodeWidth}
          nodeHeight={DIMENSIONS.nodeHeight}
          rowGapRatio={DIMENSIONS.rowGapRatio}
          columnGapRatio={DIMENSIONS.columnGapRatio}
          nodeShapes={new Map(people.map((id) => [id, 'circle' as const]))}
          renderNode={(id) => <div>{id}</div>}
        />,
      );
      const svg = container.querySelector('svg')!;
      const width = Number(svg.getAttribute('width'));
      const height = Number(svg.getAttribute('height'));
      const [dx, dy] = coordinates(
        svg.querySelector('g[transform]')?.getAttribute('transform') ?? '0,0',
      ).map((p) => [p.x, p.y])[0] ?? [0, 0];
      const outside: string[] = [];
      // Every mark, whatever its kind, and every place it covers.
      for (const mark of drawnMarks(container)) {
        for (const p of markPlaces(mark)) {
          const [x, y] = [p.x + dx!, p.y + dy!];
          if (x < 0 || x > width || y < 0 || y > height) {
            outside.push(`${mark.tagName} ${x},${y}`);
          }
        }
      }
      expect(outside).toEqual([]);
    });
  }
});

describe('the former-partner break', () => {
  // Partners at 0 and 300 with 100-wide symbols: the line between their
  // symbols runs from 50 to 250.
  const former = (
    descentXPositions: number[],
    auxiliaryXPositions: number[],
  ): ParentGroupConnector => ({
    type: 'parent-group',
    segment: { type: 'line', x1: 0, y1: 50, x2: 300, y2: 50 },
    double: false,
    isActive: false,
    nodeHalfWidth: 50,
    descentXPositions,
    auxiliaryXPositions,
  });
  const clearOf = (conn: ParentGroupConnector, xs: number[]) => {
    const { centre, halfWidth } = formerPartnerBreak(conn);
    expect(centre - halfWidth).toBeGreaterThan(50);
    expect(centre + halfWidth).toBeLessThan(250);
    for (const x of xs) {
      expect(Math.abs(x - centre)).toBeGreaterThan(halfWidth + EDGE_WIDTH);
    }
  };

  it('moves off a line crossing the partnership line where it would go', () => {
    clearOf(former([], [152]), [152]);
  });

  it('keeps clear of lines of descent and crossing lines together', () => {
    // Beside the descent, the break goes midway to a symbol, whichever
    // side has no crossing line.
    clearOf(former([150], [200]), [150, 200]);
    clearOf(former([150], [100]), [150, 100]);
  });

  it('stays where it would go when nothing crosses there', () => {
    expect(formerPartnerBreak(former([], [60])).centre).toBe(150);
  });
});

// Every line ends exactly on what it meets (Josh, 12 Oct 2026): on a person,
// on the outline PersonNode paints, where the lines into a child converge
// at its top and run on under the symbol, showing no corner; on a line, on
// its centreline. Measured for every family, in every shape, at both the
// interface's sizes.
describe('every line ends exactly on what it meets', () => {
  for (const size of [96, 87]) {
    for (const shape of ['circle', 'square', 'diamond'] as const) {
      for (const [name, { people, links }] of Object.entries(families)) {
        it(`${name} (${shape}s, ${size}px)`, () => {
          const { drawing } = draw(people, links, shape, size);
          expect(lineEndFaults(drawing)).toEqual([]);
        });
      }
    }
  }
});
