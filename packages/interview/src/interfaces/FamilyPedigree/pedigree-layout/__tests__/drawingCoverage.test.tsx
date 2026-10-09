/**
 * The drawing accounts for every recorded tie: each parent tie is drawn by a
 * line of descent, a line of its own, a couple's line or a line to the
 * sibship's bar; each partnership by a partnership line; each pair of twins
 * by a twin mark; and every line lies inside the drawing, clear of the
 * former-partner break.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import { EDGE_WIDTH, formerPartnerBreak } from '../components/EdgeRenderer';
import PedigreeLayout from '../components/PedigreeLayout';
import { computeConnectors } from '../connectors';
import type { LayoutDimensions } from '../layoutDimensions';
import {
  buildConnectorData,
  pedigreeLayoutToPositions,
  toPedigreeInput,
} from '../pedigreeAdapter';
import type {
  LineSegment,
  ParentConnection,
  ParentGroupConnector,
  PedigreeConnectors,
  PedigreeLayout as Layout,
  PedigreeLink,
  Point,
} from '../types';

const DIMENSIONS: LayoutDimensions = {
  nodeWidth: 108,
  nodeHeight: 108,
  rowGapRatio: 1.4,
  columnGapRatio: 1.4,
};

function draw(people: string[], links: PedigreeLink[]) {
  const { input, indexToId, idToIndex } = toPedigreeInput(people, links);
  const layout = alignPedigree(input);
  const { connectors } = buildConnectorData(
    layout,
    links,
    DIMENSIONS,
    input.parents,
    idToIndex,
    people,
    indexToId,
  );
  const topLeft = pedigreeLayoutToPositions(layout, indexToId, DIMENSIONS);
  const centre = (personId: string): Point => {
    const position = topLeft.get(personId);
    if (!position) throw new Error(`${personId} is not drawn`);
    return {
      x: position.x + DIMENSIONS.nodeWidth / 2,
      y: position.y + DIMENSIONS.nodeHeight / 2,
    };
  };
  return { connectors, centre };
}

const parent = (
  source: string,
  kind: 'biological' | 'social' | 'adoptive' | 'donor' | 'surrogate',
  target: string,
  carrier = false,
): PedigreeLink => ({ source, target, kind, isGestationalCarrier: carrier });
const partners = (a: string, b: string, isActive = true): PedigreeLink => ({
  source: a,
  target: b,
  kind: 'partner',
  isActive,
});
const twins = (
  a: string,
  b: string,
  kind: 'identicalTwin' | 'fraternalTwin' | 'unknownZygosityTwin',
): PedigreeLink => ({ source: a, target: b, kind });

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
        const start = l.points[0]!;
        return (
          close(start.x, (centre(p).x + centre(q).x) / 2) &&
          close(start.y, centre(p).y)
        );
      })
    ) {
      return true;
    }
    const sibship = connectors.parentChildLines.filter((pc) =>
      pc.uplineChildIds?.includes(c),
    );
    // The line of descent from the parent, or from the parent's couple: from
    // their partnership line (either rail of a double one, or a line routed
    // above their row), or from midway between them.
    for (const pc of sibship) {
      const [top] = pc.parentLink;
      if (!top || !pc.parentIds?.includes(p)) continue;
      if (close(top.x1, centre(p).x) && close(top.y1, centre(p).y)) return true;
      const start = { x: top.x1, y: top.y1 };
      if (
        pc.parentIds.some(
          (q) =>
            q !== p &&
            ((close(start.x, (centre(p).x + centre(q).x) / 2) &&
              close(start.y, centre(p).y)) ||
              connectors.groupLines.some(
                (g) =>
                  same(g.partnerIds, [p, q]) &&
                  [
                    g.segment,
                    ...(g.doubleSegment ? [g.doubleSegment] : []),
                  ].some((rail) => onSegment(start, rail)),
              )),
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
    return aux.some((l) => {
      if (l.endpointIds?.[0] !== p || l.endpointIds[1] !== undefined) {
        return false;
      }
      const end = l.points.at(-1)!;
      return (
        close(end.y, childTop.y) && bars.some((bar) => onSegment(end, bar))
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

const families: Record<string, { people: string[]; links: PedigreeLink[] }> = {
  'a surrogate of twins': {
    people: ['ego', 'mum', 'dad', 'arjun', 'lena'],
    links: [
      parent('mum', 'biological', 'ego'),
      parent('dad', 'biological', 'ego'),
      parent('mum', 'biological', 'arjun'),
      parent('dad', 'biological', 'arjun'),
      partners('mum', 'dad'),
      parent('lena', 'surrogate', 'ego', true),
      parent('lena', 'surrogate', 'arjun', true),
      twins('ego', 'arjun', 'unknownZygosityTwin'),
    ],
  },
  'identical twins with different recorded fathers': {
    people: ['ego', 'paul', 'jane', 'gran', 'grandad', 'peter', 'other'],
    links: [
      parent('paul', 'biological', 'ego'),
      parent('jane', 'biological', 'ego', true),
      partners('gran', 'grandad'),
      parent('gran', 'biological', 'paul', true),
      parent('grandad', 'biological', 'paul'),
      parent('gran', 'biological', 'peter', true),
      parent('other', 'biological', 'peter'),
      twins('paul', 'peter', 'identicalTwin'),
    ],
  },
  'a step parent and a donor': {
    people: ['ego', 'beth', 'jo', 'tom'],
    links: [
      parent('beth', 'biological', 'ego', true),
      parent('jo', 'social', 'ego'),
      partners('beth', 'jo'),
      parent('tom', 'donor', 'ego'),
    ],
  },
  'an adopted child’s birth parents and their new partners': {
    people: ['ego', 'chloe', 'tyler', 'helen', 'mark', 'sam', 'amber'],
    links: [
      parent('chloe', 'biological', 'ego', true),
      parent('tyler', 'biological', 'ego'),
      partners('chloe', 'tyler', false),
      parent('helen', 'adoptive', 'ego'),
      parent('mark', 'adoptive', 'ego'),
      partners('helen', 'mark'),
      partners('chloe', 'sam'),
      partners('tyler', 'amber'),
    ],
  },
  'a child adopted by their grandparents': {
    people: ['ego', 'kayla', 'tyler', 'patricia', 'ronald'],
    links: [
      parent('kayla', 'biological', 'ego', true),
      parent('tyler', 'biological', 'ego'),
      partners('kayla', 'tyler', false),
      parent('patricia', 'biological', 'kayla', true),
      parent('ronald', 'biological', 'kayla'),
      partners('patricia', 'ronald'),
      parent('patricia', 'adoptive', 'ego'),
      parent('ronald', 'adoptive', 'ego'),
    ],
  },
  'a child adopted by their brother': {
    people: ['ego', 'rosa', 'luis', 'marco', 'pat'],
    links: [
      parent('rosa', 'biological', 'ego', true),
      parent('luis', 'biological', 'ego'),
      partners('rosa', 'luis'),
      parent('rosa', 'biological', 'marco', true),
      parent('luis', 'biological', 'marco'),
      parent('marco', 'adoptive', 'ego'),
      partners('ego', 'pat'),
    ],
  },
  'step parents and adoptive parents who separated': {
    people: [
      'ego',
      'karen',
      'mike',
      'shannon',
      'egoFather',
      'lauren',
      'denise',
      'jack',
    ],
    links: [
      parent('egoFather', 'biological', 'ego'),
      parent('karen', 'adoptive', 'ego'),
      parent('mike', 'adoptive', 'ego'),
      partners('karen', 'mike', false),
      parent('shannon', 'biological', 'ego', true),
      partners('mike', 'lauren'),
      parent('lauren', 'social', 'ego'),
      partners('karen', 'denise'),
      parent('denise', 'social', 'ego'),
      parent('mike', 'biological', 'jack'),
      parent('lauren', 'biological', 'jack', true),
    ],
  },
  'one donor to a mother and a father': {
    people: [
      'ego',
      'emma',
      'liam',
      'claire',
      'donor',
      'julie',
      'kate',
      'liamFather',
    ],
    links: [
      parent('liamFather', 'biological', 'liam'),
      parent('emma', 'biological', 'ego', true),
      parent('liam', 'biological', 'ego'),
      partners('emma', 'liam'),
      parent('claire', 'biological', 'emma', true),
      parent('donor', 'donor', 'emma'),
      parent('julie', 'biological', 'liam', true),
      parent('kate', 'social', 'liam'),
      partners('julie', 'kate'),
      parent('donor', 'donor', 'liam'),
    ],
  },
  'a donor to two of three half-siblings': {
    people: ['ego', 'hannah', 'paul', 'ruby', 'theo', 'theoDonor'],
    links: [
      parent('hannah', 'biological', 'ego', true),
      parent('paul', 'donor', 'ego'),
      parent('hannah', 'biological', 'ruby', true),
      parent('paul', 'donor', 'ruby'),
      parent('hannah', 'biological', 'theo', true),
      parent('theoDonor', 'donor', 'theo'),
    ],
  },
  'a granddaughter adopted by her grandparents, with a former partner': {
    people: ['ego', 'margaret', 'hugh', 'ian', 'chloe', 'formerPartner'],
    links: [
      parent('margaret', 'biological', 'ego', true),
      parent('hugh', 'biological', 'ego'),
      partners('margaret', 'hugh'),
      parent('margaret', 'biological', 'ian', true),
      parent('hugh', 'biological', 'ian'),
      parent('ego', 'biological', 'chloe', true),
      parent('formerPartner', 'biological', 'chloe'),
      partners('ego', 'formerPartner', false),
      parent('margaret', 'adoptive', 'chloe'),
      parent('hugh', 'adoptive', 'chloe'),
    ],
  },
  'co-parents who were never partners': {
    people: ['ego', 'ann', 'bob', 'sib'],
    links: [
      parent('ann', 'biological', 'ego', true),
      parent('bob', 'biological', 'ego'),
      parent('ann', 'biological', 'sib', true),
      parent('bob', 'biological', 'sib'),
    ],
  },
};

describe('the drawing accounts for every recorded tie', () => {
  for (const [name, { people, links }] of Object.entries(families)) {
    it(name, () => {
      const { connectors, centre } = draw(people, links);
      expect(unaccounted(links, connectors, centre)).toEqual([]);
    });
  }

  it('reports a tie that is not drawn', () => {
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

/** The numbers in an SVG points list or path. */
const coordinates = (text: string): Point[] => {
  const numbers = (text.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const points: Point[] = [];
  for (let k = 0; k + 1 < numbers.length; k += 2) {
    points.push({ x: numbers[k]!, y: numbers[k + 1]! });
  }
  return points;
};

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
      for (const element of Array.from(
        svg.querySelectorAll('polyline, path'),
      )) {
        // A path's arcs carry radii and flags; only its M and L points are
        // places on the line.
        const text =
          element.tagName === 'path'
            ? (element.getAttribute('d') ?? '').replace(
                /A[^A-Z]*?(?=[ML]|$)/g,
                '',
              )
            : (element.getAttribute('points') ?? '');
        for (const p of coordinates(text)) {
          const [x, y] = [p.x + dx!, p.y + dy!];
          if (x < 0 || x > width || y < 0 || y > height) {
            outside.push(`${x},${y}`);
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
