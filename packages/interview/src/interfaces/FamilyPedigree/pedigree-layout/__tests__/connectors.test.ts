import { describe, expect, it } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import { computeConnectors } from '../connectors';
import type {
  LineSegment,
  ParentConnection,
  PedigreeInput,
  PedigreeLayout,
  ScalingParams,
} from '../types';

/** Where an auxiliary line ends: on the child, or on the bar it joins. */
const endOf = (line: { points: { x: number; y: number }[] }) =>
  line.points[line.points.length - 1]!;

describe('computeConnectors', () => {
  const scaling: ScalingParams = {
    boxWidth: 0.5,
    boxHeight: 0.5,
    legHeight: 0.25,
    hScale: 1,
    vScale: 1,
  };

  const layout: PedigreeLayout = {
    n: [2, 3],
    nid: [
      [1, 2, 0],
      [3, 4, 5],
    ],
    pos: [
      [0, 2, 0],
      [0, 1, 2],
    ],
    fam: [
      [0, 0, 0],
      [1, 1, 1],
    ],
    group: [
      [1, 0, 0],
      [0, 0, 0],
    ],
    twins: null,
    groupMember: [
      [false, false, false],
      [false, false, false],
    ],
  };

  const parents: ParentConnection[][] = [
    [],
    [],
    [],
    [
      { parentIndex: 1, edgeType: 'biological' },
      { parentIndex: 2, edgeType: 'biological' },
    ],
    [
      { parentIndex: 1, edgeType: 'biological' },
      { parentIndex: 2, edgeType: 'biological' },
    ],
    [
      { parentIndex: 1, edgeType: 'biological' },
      { parentIndex: 2, edgeType: 'biological' },
    ],
  ];

  it('produces parent group connectors', () => {
    const connectors = computeConnectors(layout, scaling, parents);
    expect(connectors.groupLines.length).toBeGreaterThan(0);
    expect(connectors.groupLines[0]!.type).toBe('parent-group');
  });

  it('produces parent-child connectors with edgeType', () => {
    const connectors = computeConnectors(layout, scaling, parents);
    expect(connectors.parentChildLines.length).toBeGreaterThan(0);
    expect(connectors.parentChildLines[0]!.edgeType).toBe('biological');
  });

  it('draws a parent link as one straight drop when the bar is joined under the descent', () => {
    const connectors = computeConnectors(
      layout,
      scaling,
      parents,
      undefined,
      0.6,
    );
    const pc = connectors.parentChildLines[0]!;
    expect(pc.parentLink).toEqual([
      { type: 'line', x1: 1, y1: 0.25, x2: 1, y2: 0.75 },
    ]);
  });

  it('draws an offset parent link as a drop, a level run and a drop, with no zero-length piece', () => {
    // A lone child under the left parent of a couple centred on x = 1.
    const offsetLayout: PedigreeLayout = {
      ...layout,
      n: [2, 1],
      nid: [
        [1, 2, 0],
        [3, 0, 0],
      ],
      pos: [
        [0, 2, 0],
        [0, 0, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 0, 0],
      ],
    };
    const connectors = computeConnectors(
      offsetLayout,
      scaling,
      parents,
      undefined,
      0.6,
    );
    const pc = connectors.parentChildLines[0]!;
    expect(pc.parentLink).toHaveLength(3);
    const [drop, run, foot] = pc.parentLink as [
      LineSegment,
      LineSegment,
      LineSegment,
    ];
    expect(drop.x1).toBe(drop.x2);
    expect(run.y1).toBe(run.y2);
    expect(foot.x1).toBe(foot.x2);
    // The run lies between the parents' row and the sibling bar.
    expect(run.y1).toBeGreaterThan(0.5);
    expect(run.y1).toBeLessThan(0.75);
    // A lone child has no sibling bar to draw.
    expect(pc.siblingBar).toBeUndefined();
    for (const segment of [...pc.parentLink, ...pc.uplines]) {
      expect(
        Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1),
      ).toBeGreaterThan(0);
    }
  });

  it('gives two families’ lines of descent between the same rows level runs at heights of their own', () => {
    // Couples A–B and C–D; the A–B child sits under C–D and the C–D child
    // under A–B, so the two runs overlap.
    const crossed: PedigreeLayout = {
      n: [4, 2],
      nid: [
        [0, 1, 2, 3],
        [5, 4, 0, 0],
      ],
      pos: [
        [0, 1, 2, 3],
        [0, 3, 0, 0],
      ],
      fam: [
        [0, 0, 0, 0],
        [3, 1, 0, 0],
      ],
      group: [
        [1, 0, 1, 0],
        [0, 0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false, false],
        [false, false, false, false],
      ],
    };
    const bio = (parentIndex: number): ParentConnection => ({
      parentIndex,
      edgeType: 'biological',
    });
    const crossedParents: ParentConnection[][] = [
      [],
      [],
      [],
      [],
      [bio(0), bio(1)],
      [bio(2), bio(3)],
    ];
    const runYs = (l: PedigreeLayout) =>
      computeConnectors(l, scaling, crossedParents, undefined, 0.6)
        .parentChildLines.map(
          (line) =>
            line.parentLink.find((s) => s.y1 === s.y2 && s.x1 !== s.x2)?.y1,
        )
        .filter((y) => y !== undefined);
    const [first, second] = runYs(crossed);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(Math.abs(first! - second!)).toBeGreaterThan(0.01);
    // Both still lie between the parents' row and the sibling bar.
    for (const y of [first!, second!]) {
      expect(y).toBeGreaterThan(0.5);
      expect(y).toBeLessThan(0.75);
    }

    // Runs that do not overlap keep the usual height, halfway down.
    const apart: PedigreeLayout = {
      ...crossed,
      nid: [
        [0, 1, 2, 3],
        [4, 5, 0, 0],
      ],
      pos: [
        [0, 1, 2, 3],
        [0, 3, 0, 0],
      ],
      fam: [
        [0, 0, 0, 0],
        [1, 3, 0, 0],
      ],
    };
    expect(runYs(apart)).toEqual([0.625, 0.625]);
  });

  it('produces 2 parent link segments, the shoulder diagonal, when branch = 0', () => {
    const connectors = computeConnectors(
      {
        ...layout,
        pos: [
          [0, 2, 0],
          [1.5, 2.5, 3.5],
        ],
      },
      scaling,
      parents,
      undefined,
      0,
    );
    const pc = connectors.parentChildLines[0]!;
    expect(pc.parentLink.length).toBe(2);
    expect(pc.parentLink[1]!.x1).not.toBe(pc.parentLink[1]!.x2);
  });

  it('group connector double flag reflects consanguinity', () => {
    const connectors = computeConnectors(layout, scaling, parents);
    expect(connectors.groupLines[0]!.double).toBe(false);
    expect(connectors.groupLines[0]!.doubleSegment).toBeUndefined();
  });

  it('produces double line for consanguineous pairs', () => {
    const consLayout: PedigreeLayout = {
      ...layout,
      group: [
        [2, 0, 0],
        [0, 0, 0],
      ],
    };
    const connectors = computeConnectors(consLayout, scaling, parents);
    expect(connectors.groupLines[0]!.double).toBe(true);
    expect(connectors.groupLines[0]!.doubleSegment).toBeDefined();
  });

  it('produces duplicate arcs for repeated subjects', () => {
    const dupLayout: PedigreeLayout = {
      n: [3, 0],
      nid: [
        [1, 2, 1],
        [0, 0, 0],
      ],
      pos: [
        [0, 1, 3],
        [0, 0, 0],
      ],
      fam: [
        [0, 0, 0],
        [0, 0, 0],
      ],
      group: [
        [0, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const connectors = computeConnectors(dupLayout, scaling, []);
    expect(connectors.duplicateArcs.length).toBe(1);
    expect(connectors.duplicateArcs[0]!.personIndex).toBe(1);
    expect(connectors.duplicateArcs[0]!.path.dashed).toBe(true);
    expect(connectors.duplicateArcs[0]!.path.points.length).toBe(15);
  });

  it('produces auxiliary connectors for donor edges', () => {
    const donorLayout: PedigreeLayout = {
      n: [3, 1],
      nid: [
        [0, 1, 2],
        [3, 0, 0],
      ],
      pos: [
        [0, 1, 3],
        [0.5, 0, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      group: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const donorParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'donor' },
      ],
    ];
    const connectors = computeConnectors(donorLayout, scaling, donorParents);
    expect(connectors.auxiliaryLines.length).toBe(1);
    expect(connectors.auxiliaryLines[0]!.edgeType).toBe('donor');
    expect(connectors.auxiliaryLines[0]!.points.length).toBeGreaterThan(1);
  });

  it('routes parent links to specific couple midpoints in multi-partner layouts', () => {
    const multiLayout: PedigreeLayout = {
      n: [3, 2],
      nid: [
        [1, 0, 2],
        [3, 4, 0],
      ],
      pos: [
        [0, 1, 2],
        [0.5, 1.5, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 2, 0],
      ],
      group: [
        [1, 1, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };

    const multiParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 0, edgeType: 'biological' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'biological' },
      ],
    ];

    const connectors = computeConnectors(multiLayout, scaling, multiParents);

    expect(connectors.parentChildLines.length).toBe(2);

    const pc1 = connectors.parentChildLines[0]!;
    const pc1ParentX = pc1.parentLink[0]!.x1;
    expect(pc1ParentX).toBeCloseTo(0.5, 1);

    const pc2 = connectors.parentChildLines[1]!;
    const pc2ParentX = pc2.parentLink[0]!.x1;
    expect(pc2ParentX).toBeCloseTo(1.5, 1);
  });

  it('produces auxiliary connectors for a parent outside the couple', () => {
    const bioLayout: PedigreeLayout = {
      n: [3, 1],
      nid: [
        [0, 1, 2],
        [3, 0, 0],
      ],
      pos: [
        [0, 1, 3],
        [0.5, 0, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      group: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const bioParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'biological' },
      ],
    ];
    const connectors = computeConnectors(bioLayout, scaling, bioParents);
    expect(connectors.auxiliaryLines.length).toBe(1);
    expect(connectors.auxiliaryLines[0]!.edgeType).toBe('biological');
  });

  it('marks group lines as active when no activePartnerPairs provided', () => {
    const connectors = computeConnectors(layout, scaling, parents);
    expect(connectors.groupLines[0]!.isActive).toBe(true);
  });

  it('marks group lines as inactive for non-active partner pairs', () => {
    const activePairs = new Set<string>();
    const connectors = computeConnectors(layout, scaling, parents, activePairs);
    expect(connectors.groupLines.length).toBe(1);
    expect(connectors.groupLines[0]!.isActive).toBe(false);
  });

  it('marks group lines as active for active partner pairs', () => {
    const activePairs = new Set(['1,2']);
    const connectors = computeConnectors(layout, scaling, parents, activePairs);
    expect(connectors.groupLines.length).toBe(1);
    expect(connectors.groupLines[0]!.isActive).toBe(true);
  });

  it('descends from genetic contributor when only one parent is biological', () => {
    // Parent 0 (biological) at pos 0, Parent 1 (social) at pos 2
    const socialLayout: PedigreeLayout = {
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
        [1, 0],
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
    const socialParents: ParentConnection[][] = [
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'social' },
      ],
    ];
    const connectors = computeConnectors(socialLayout, scaling, socialParents);
    const pc = connectors.parentChildLines[0]!;
    // Descent should be from parent 0's position (x=0), not midpoint (x=1)
    expect(pc.parentLink[0]!.x1).toBeCloseTo(0, 1);
  });

  it('descends from couple midpoint when both parents are biological', () => {
    const connectors = computeConnectors(layout, scaling, parents);
    const pc = connectors.parentChildLines[0]!;
    // Both parents biological: midpoint of pos 0 and 2 = 1
    expect(pc.parentLink[0]!.x1).toBeCloseTo(1, 1);
  });

  it('auxiliary connector connects to sibling bar when donor is parent of ALL siblings', () => {
    // 2 parents (0,1) + 1 donor (2) + 2 children (3,4)
    // Donor has donor edges to BOTH children
    const donorAllLayout: PedigreeLayout = {
      n: [3, 2],
      nid: [
        [0, 1, 2],
        [3, 4, 0],
      ],
      pos: [
        [0, 1, 3],
        [0, 1, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 1, 0],
      ],
      group: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const donorAllParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'donor' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'donor' },
      ],
    ];
    const connectors = computeConnectors(
      donorAllLayout,
      scaling,
      donorAllParents,
    );
    expect(connectors.auxiliaryLines.length).toBe(1);
    // Sibling bar y = childLevel(1) - legh(0.25) = 0.75
    expect(endOf(connectors.auxiliaryLines[0]!).y).toBeCloseTo(0.75, 5);
  });

  it('auxiliary connector connects directly to child when donor is parent of only SOME siblings', () => {
    // 2 parents (0,1) + 2 donors (2,3) + 2 children (4,5)
    // Donor2 has donor edge to child4 only, Donor3 has donor edge to child5 only
    const donorSomeLayout: PedigreeLayout = {
      n: [4, 2],
      nid: [
        [0, 1, 2, 3],
        [4, 5, 0, 0],
      ],
      pos: [
        [0, 1, 3, 4],
        [0, 1, 0, 0],
      ],
      fam: [
        [0, 0, 0, 0],
        [1, 1, 0, 0],
      ],
      group: [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false, false],
        [false, false, false, false],
      ],
    };
    const donorSomeParents: ParentConnection[][] = [
      [],
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'donor' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 3, edgeType: 'donor' },
      ],
    ];
    const connectors = computeConnectors(
      donorSomeLayout,
      scaling,
      donorSomeParents,
    );
    expect(connectors.auxiliaryLines.length).toBe(2);
    // Each connects directly to child: y = childLevel(1) + boxh/2(0.25) = 1.25
    expect(endOf(connectors.auxiliaryLines[0]!).y).toBeCloseTo(1.25, 5);
    expect(endOf(connectors.auxiliaryLines[1]!).y).toBeCloseTo(1.25, 5);
  });

  it('auxiliary connector connects directly to child when single child in family', () => {
    // 2 parents (0,1) + 1 donor (2) + 1 child (3) — same as existing fixture
    const singleChildLayout: PedigreeLayout = {
      n: [3, 1],
      nid: [
        [0, 1, 2],
        [3, 0, 0],
      ],
      pos: [
        [0, 1, 3],
        [0.5, 0, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      group: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const singleChildParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'donor' },
      ],
    ];
    const connectors = computeConnectors(
      singleChildLayout,
      scaling,
      singleChildParents,
    );
    expect(connectors.auxiliaryLines.length).toBe(1);
    // Single child: connects directly to child node y = 1 + 0.25 = 1.25
    expect(endOf(connectors.auxiliaryLines[0]!).y).toBeCloseTo(1.25, 5);
  });

  it('social parent connector connects to sibling bar when social parent of ALL siblings', () => {
    // mom(0) + stepdad(1) couple, biodad(2) is biological to both children
    // stepdad(1) is social parent of both children (3,4)
    // biodad(2) is unpartnered biological parent of both children
    const socialAllLayout: PedigreeLayout = {
      n: [3, 2],
      nid: [
        [0, 1, 2],
        [3, 4, 0],
      ],
      pos: [
        [0, 1, 3],
        [0, 1, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 1, 0],
      ],
      group: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const socialAllParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'social' },
        { parentIndex: 2, edgeType: 'biological' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'social' },
        { parentIndex: 2, edgeType: 'biological' },
      ],
    ];
    const activePairs = new Set(['0,1']);
    const connectors = computeConnectors(
      socialAllLayout,
      scaling,
      socialAllParents,
      activePairs,
    );
    const bioAux = connectors.auxiliaryLines.filter(
      (l) => l.edgeType === 'biological',
    );
    expect(bioAux.length).toBe(1);
    // Connects to sibling bar y = 1 - 0.25 = 0.75
    expect(endOf(bioAux[0]!).y).toBeCloseTo(0.75, 5);
  });

  it('social parent connector connects directly to child when social parent of only SOME siblings', () => {
    // mom(0) + stepdad(1) couple, biodad1(2) bio to child3 only, biodad2(3) bio to child4 only
    const socialSomeLayout: PedigreeLayout = {
      n: [4, 2],
      nid: [
        [0, 1, 2, 3],
        [4, 5, 0, 0],
      ],
      pos: [
        [0, 1, 3, 4],
        [0, 1, 0, 0],
      ],
      fam: [
        [0, 0, 0, 0],
        [1, 1, 0, 0],
      ],
      group: [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false, false],
        [false, false, false, false],
      ],
    };
    const socialSomeParents: ParentConnection[][] = [
      [],
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'social' },
        { parentIndex: 2, edgeType: 'biological' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'social' },
        { parentIndex: 3, edgeType: 'biological' },
      ],
    ];
    const activePairs = new Set(['0,1']);
    const connectors = computeConnectors(
      socialSomeLayout,
      scaling,
      socialSomeParents,
      activePairs,
    );
    const bioAux = connectors.auxiliaryLines.filter(
      (l) => l.edgeType === 'biological',
    );
    expect(bioAux.length).toBe(2);
    // Each connects directly to child: y = 1 + 0.25 = 1.25
    expect(endOf(bioAux[0]!).y).toBeCloseTo(1.25, 5);
    expect(endOf(bioAux[1]!).y).toBeCloseTo(1.25, 5);
  });

  it('slashSide is set correctly for inactive group lines', () => {
    // biodad(0) inactive partner with mom(1), mom(1) active partner with stepdad(2)
    // child(3) from biodad+mom
    const blendedLayout: PedigreeLayout = {
      n: [3, 1],
      nid: [
        [0, 1, 2],
        [3, 0, 0],
      ],
      pos: [
        [0, 1, 2],
        [0.5, 0, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      group: [
        [1, 1, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const blendedParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
    ];
    // mom(1)+stepdad(2) is active, biodad(0)+mom(1) is inactive
    const activePairs = new Set(['1,2']);
    const connectors = computeConnectors(
      blendedLayout,
      scaling,
      blendedParents,
      activePairs,
    );

    const inactiveLine = connectors.groupLines.find((g) => !g.isActive);
    expect(inactiveLine).toBeDefined();
    // biodad(0) has no active relationship → slash goes on left (biodad's side)
    expect(inactiveLine!.slashSide).toBe('left');
  });

  it('treats adoptive edges as primary', () => {
    // adoptiveMom(0) + adoptiveDad(1) as couple, bioMom(2) separate, child(3)
    const adoptiveLayout: PedigreeLayout = {
      n: [3, 1],
      nid: [
        [0, 1, 2],
        [3, 0, 0],
      ],
      pos: [
        [0, 1, 3],
        [0.5, 0, 0],
      ],
      fam: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      group: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const adoptiveParents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'adoptive' },
        { parentIndex: 1, edgeType: 'adoptive' },
        { parentIndex: 2, edgeType: 'biological' },
      ],
    ];
    const connectors = computeConnectors(
      adoptiveLayout,
      scaling,
      adoptiveParents,
    );
    expect(connectors.parentChildLines.length).toBeGreaterThan(0);
    expect(connectors.parentChildLines[0]!.edgeType).toBe('adoptive');
  });

  it('uses standard parent link (not diagonal joins) for inactive partnerships', () => {
    // Two parents, inactive partnership, one child
    const inactiveLayout: PedigreeLayout = {
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
        [1, 0],
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
    const inactiveParents: ParentConnection[][] = [
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
    ];
    // Empty active set = no active partners
    const activePairs = new Set<string>();
    const connectors = computeConnectors(
      inactiveLayout,
      scaling,
      inactiveParents,
      activePairs,
    );
    const pc = connectors.parentChildLines[0]!;
    // A standard parent link, straight down to the child below the couple's
    // midpoint, not diagonal joins
    expect(pc.parentLink).toHaveLength(1);
    // Parent link should descend from couple midpoint (both biological)
    expect(pc.parentLink[0]!.x1).toBeCloseTo(1, 1);
    expect(pc.parentLink[0]!.x2).toBeCloseTo(1, 1);
  });

  describe('node id attachment (id parameter)', () => {
    // 3-generation: grandparents(0,1) → parent(2) + partner(3) → children(4,5)
    // Level 0: nid=[0,1], group=[1] → couple (0,1) forms family 1
    // Level 1: nid=[2,3], group=[1] → couple (2,3) forms family 1
    // Level 2: nid=[4,5], fam=[1,1] → children of couple at level-1 coupleLeft=0
    const threeGenLayout: PedigreeLayout = {
      n: [2, 2, 2],
      nid: [
        [0, 1],
        [2, 3],
        [4, 5],
      ],
      pos: [
        [0, 2],
        [0, 2],
        [0, 2],
      ],
      fam: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      group: [
        [1, 0],
        [1, 0],
        [0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false],
        [false, false],
        [false, false],
      ],
    };
    const threeGenParents: ParentConnection[][] = [
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
      [],
      [
        { parentIndex: 2, edgeType: 'biological' },
        { parentIndex: 3, edgeType: 'biological' },
      ],
      [
        { parentIndex: 2, edgeType: 'biological' },
        { parentIndex: 3, edgeType: 'biological' },
      ],
    ];
    const threeGenIds = [
      'gp-left',
      'gp-right',
      'parent',
      'partner',
      'child-a',
      'child-b',
    ];

    it('attaches partnerIds to group line connectors when id is provided', () => {
      const connectors = computeConnectors(
        threeGenLayout,
        scaling,
        threeGenParents,
        undefined,
        0.6,
        0.5,
        undefined,
        threeGenIds,
      );
      expect(connectors.groupLines.length).toBeGreaterThan(0);
      const gpGroupLine = connectors.groupLines[0]!;
      expect(gpGroupLine.partnerIds).toEqual(['gp-left', 'gp-right']);
    });

    it('omits partnerIds from group line connectors when id is not provided', () => {
      const connectors = computeConnectors(
        threeGenLayout,
        scaling,
        threeGenParents,
      );
      expect(connectors.groupLines[0]!.partnerIds).toBeUndefined();
    });

    it('attaches parentIds and uplineChildIds to parent-child connectors when id is provided', () => {
      const connectors = computeConnectors(
        threeGenLayout,
        scaling,
        threeGenParents,
        undefined,
        0.6,
        0.5,
        undefined,
        threeGenIds,
      );

      // First parentChildLine: grandparents → parent
      const gpPc = connectors.parentChildLines[0]!;
      expect(gpPc.parentIds).toBeDefined();
      expect(gpPc.parentIds).toContain('gp-left');
      expect(gpPc.parentIds).toContain('gp-right');

      // uplineChildIds[0] is the child node id for the first upline
      expect(gpPc.uplineChildIds).toBeDefined();
      expect(gpPc.uplineChildIds![0]).toBe('parent');

      // Second parentChildLine: parent+partner → children
      const childPc = connectors.parentChildLines[1]!;
      expect(childPc.parentIds).toContain('parent');
      expect(childPc.parentIds).toContain('partner');
      expect(childPc.uplineChildIds).toHaveLength(2);
      expect(childPc.uplineChildIds).toContain('child-a');
      expect(childPc.uplineChildIds).toContain('child-b');
    });

    it('omits parentIds and uplineChildIds from parent-child connectors when id is not provided', () => {
      const connectors = computeConnectors(
        threeGenLayout,
        scaling,
        threeGenParents,
      );
      expect(connectors.parentChildLines[0]!.parentIds).toBeUndefined();
      expect(connectors.parentChildLines[0]!.uplineChildIds).toBeUndefined();
    });
  });

  it('joins a sibling who adopted the child by a line below the row, into the child from below', () => {
    // Jade (2) adopted her sibling (3), who stays in their birth sibship, so
    // she sits on the child's row.
    const sameRowLayout: PedigreeLayout = {
      n: [2, 2],
      nid: [
        [0, 1],
        [2, 3],
      ],
      pos: [
        [0.5, 1.5],
        [0, 2],
      ],
      fam: [
        [0, 0],
        [1, 1],
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
    const sameRowParents: ParentConnection[][] = [
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'adoptive' },
      ],
    ];
    const connectors = computeConnectors(
      sameRowLayout,
      scaling,
      sameRowParents,
    );
    expect(connectors.auxiliaryLines).toHaveLength(1);
    expect(connectors.auxiliaryLines[0]!.edgeType).toBe('adoptive');
    const { points } = connectors.auxiliaryLines[0]!;
    const rowBottom = 1 + scaling.boxHeight;
    // No level piece along the row, where it would read as a partnership.
    for (let k = 1; k < points.length; k++) {
      if (Math.abs(points[k]!.y - points[k - 1]!.y) < 1e-9) {
        expect(points[k]!.y).toBeGreaterThan(rowBottom);
      }
    }
    // It ends in the child, coming up from below, off their centre.
    const last = endOf(connectors.auxiliaryLines[0]!);
    const beforeLast = points[points.length - 2]!;
    expect(last.y).toBeCloseTo(1 + scaling.boxHeight / 2, 5);
    expect(beforeLast.x).toBeCloseTo(last.x, 5);
    expect(beforeLast.y).toBeGreaterThan(last.y);
    expect(Math.abs(last.x - 2)).toBeGreaterThan(0.01);
  });
});

describe('consanguinity follows genetic parents only', () => {
  const scaling: ScalingParams = {
    boxWidth: 0.5,
    boxHeight: 0.5,
    legHeight: 0.25,
    hScale: 1,
    vScale: 1,
  };
  const bio = (parentIndex: number): ParentConnection => ({
    parentIndex,
    edgeType: 'biological',
  });
  const social = (parentIndex: number): ParentConnection => ({
    parentIndex,
    edgeType: 'social',
  });
  const donor = (parentIndex: number): ParentConnection => ({
    parentIndex,
    edgeType: 'donor',
  });
  const adoptive = (parentIndex: number): ParentConnection => ({
    parentIndex,
    edgeType: 'adoptive',
  });

  // The partnership line between two people, drawn from the layout.
  const partnershipBetween = (ped: PedigreeInput, a: number, b: number) => {
    const layout = alignPedigree(ped);
    const pairs = new Set(
      (ped.partners ?? []).map(({ partnerIndex1: x, partnerIndex2: y }) =>
        [x, y].toSorted((m, n) => m - n).join(','),
      ),
    );
    const { groupLines } = computeConnectors(
      layout,
      scaling,
      ped.parents,
      pairs,
      undefined,
      undefined,
      undefined,
      ped.id,
      pairs,
    );
    const line = groupLines.find(
      (g) =>
        g.partnerIds?.includes(ped.id[a]!) && g.partnerIds.includes(ped.id[b]!),
    );
    expect(line, `${ped.id[a]} – ${ped.id[b]}`).toBeDefined();
    return line!;
  };

  it('draws step-siblings who share only a social parent with a single line', () => {
    // karen → you; steve, karen's partner, is your social parent and jake's
    // biological one. You and jake are partners.
    const ped: PedigreeInput = {
      id: ['you', 'karen', 'steve', 'jake'],
      parents: [[bio(1), social(2)], [], [], [bio(2)]],
      partners: [
        { partnerIndex1: 1, partnerIndex2: 2, isActive: true },
        { partnerIndex1: 0, partnerIndex2: 3, isActive: true },
      ],
    };
    const line = partnershipBetween(ped, 0, 3);
    expect(line.double).toBe(false);
    expect(line.doubleSegment).toBeUndefined();
  });

  it('draws adoptive siblings with a single line', () => {
    // mum + dad adopted you and biologically had sam; you and sam are partners.
    const ped: PedigreeInput = {
      id: ['you', 'mum', 'dad', 'sam'],
      parents: [[adoptive(1), adoptive(2)], [], [], [bio(1), bio(2)]],
      partners: [
        { partnerIndex1: 1, partnerIndex2: 2, isActive: true },
        { partnerIndex1: 0, partnerIndex2: 3, isActive: true },
      ],
    };
    const line = partnershipBetween(ped, 0, 3);
    expect(line.double).toBe(false);
  });

  it('still draws first cousins through an adopted cousin’s birth parent with a double line', () => {
    // gm + gd → aunt, mum. mum → you. aunt is the birth parent of cousin, whom
    // x and y adopted (the adapter turns aunt's edge into a donor edge). You
    // and cousin are partners.
    const ped: PedigreeInput = {
      id: ['gm', 'gd', 'aunt', 'mum', 'you', 'x', 'y', 'cousin'],
      parents: [
        [],
        [],
        [bio(0), bio(1)],
        [bio(0), bio(1)],
        [bio(3)],
        [],
        [],
        [donor(2), adoptive(5), adoptive(6)],
      ],
      partners: [
        { partnerIndex1: 0, partnerIndex2: 1, isActive: true },
        { partnerIndex1: 5, partnerIndex2: 6, isActive: true },
        { partnerIndex1: 4, partnerIndex2: 7, isActive: true },
      ],
    };
    const line = partnershipBetween(ped, 4, 7);
    expect(line.double).toBe(true);
    expect(line.doubleSegment).toBeDefined();
  });

  it('draws a routed partnership between step-siblings with a single line', () => {
    // As the step-siblings above, but the two sit apart, so their
    // partnership is routed above the row rather than read from the layout.
    const layout: PedigreeLayout = {
      n: [2, 3],
      nid: [
        [1, 2, 0],
        [0, 4, 3],
      ],
      pos: [
        [0.5, 1.5, 0],
        [0, 1, 2],
      ],
      fam: [
        [0, 0, 0],
        [1, 0, 1],
      ],
      group: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      twins: null,
      groupMember: [
        [false, false, false],
        [false, false, false],
      ],
    };
    const parents: ParentConnection[][] = [
      [bio(1), social(2)],
      [],
      [],
      [bio(2)],
      [],
    ];
    const ids = ['you', 'karen', 'steve', 'jake', 'friend'];
    const { groupLines } = computeConnectors(
      layout,
      scaling,
      parents,
      new Set(['0,3', '1,2']),
      undefined,
      undefined,
      undefined,
      ids,
      new Set(['0,3', '1,2']),
    );
    const routed = groupLines.find(
      (g) => g.partnerIds?.includes('you') && g.partnerIds.includes('jake'),
    );
    expect(routed).toBeDefined();
    expect(routed!.double).toBe(false);
    expect(routed!.doubleSegment).toBeUndefined();
  });
});

describe('co-parents with no recorded partnership', () => {
  const scaling: ScalingParams = {
    boxWidth: 0.5,
    boxHeight: 0.5,
    legHeight: 0.25,
    hScale: 1,
    vScale: 1,
  };
  const ids = ['ann', 'bob', 'c1', 'c2', 'x'];
  const bothBiological: ParentConnection[] = [
    { parentIndex: 0, edgeType: 'biological' },
    { parentIndex: 1, edgeType: 'biological' },
  ];
  /** Ann and Bob side by side, their two children below them. */
  const sideBySide = (grouped: boolean): PedigreeLayout => ({
    n: [2, 2],
    nid: [
      [0, 1],
      [2, 3],
    ],
    pos: [
      [0, 1],
      [0, 1],
    ],
    fam: [[0, 0], grouped ? [1, 1] : [0, 0]],
    group: [
      [grouped ? 1 : 0, 0],
      [0, 0],
    ],
    twins: null,
    groupMember: [
      [false, false],
      [false, false],
    ],
  });
  const parents: ParentConnection[][] = [
    [],
    [],
    bothBiological,
    bothBiological,
  ];
  const draw = (layout: PedigreeLayout, partnerPairs?: Set<string>) =>
    computeConnectors(
      layout,
      scaling,
      parents,
      partnerPairs ? new Set(partnerPairs) : undefined,
      undefined,
      undefined,
      undefined,
      ids,
      partnerPairs,
    );

  for (const grouped of [true, false]) {
    it(`are joined by no line, and their children descend from midway between them (${grouped ? 'paired' : 'not paired'} by the layout)`, () => {
      const connectors = draw(sideBySide(grouped), new Set());
      expect(connectors.groupLines).toEqual([]);
      expect(connectors.auxiliaryLines).toEqual([]);
      const descents = connectors.parentChildLines.filter(
        (line) => line.parentLink.length > 0,
      );
      expect(descents).toHaveLength(1);
      const [line] = descents;
      // From the point midway between them, at the height of their
      // centres, where a partnership line would run.
      expect(line!.parentLink[0]).toMatchObject({ x1: 0.5, y1: 0.25 });
      expect(line!.uplineChildIds).toEqual(['c1', 'c2']);
      expect(line!.parentIds?.toSorted()).toEqual(['ann', 'bob']);
    });
  }

  it('descends from midway between them to an only child', () => {
    const layout: PedigreeLayout = {
      n: [2, 1],
      nid: [[0, 1], [2]],
      pos: [[0, 1], [0.5]],
      fam: [[0, 0], [0]],
      group: [[0, 0], [0]],
      twins: null,
      groupMember: [[false, false], [false]],
    };
    const connectors = draw(layout, new Set());
    expect(connectors.groupLines).toEqual([]);
    expect(connectors.auxiliaryLines).toEqual([]);
    expect(connectors.parentChildLines).toHaveLength(1);
    expect(connectors.parentChildLines[0]!.parentLink[0]).toMatchObject({
      x1: 0.5,
      y1: 0.25,
    });
  });

  it('keeps the partnership line of a recorded partnership', () => {
    const connectors = draw(sideBySide(true), new Set(['0,1']));
    expect(connectors.groupLines).toHaveLength(1);
    expect(connectors.groupLines[0]!.partnerIds).toEqual(['ann', 'bob']);
  });

  it('never draws a line of descent out of someone sitting between them', () => {
    // Ann, Xavier and Bob in a row: a drop from midway between Ann and Bob
    // would come out of Xavier's symbol, and one from beside him would read
    // as his. Each parent is joined by a line of their own instead.
    const layout: PedigreeLayout = {
      n: [3, 1],
      nid: [[0, 4, 1], [2]],
      pos: [[0, 1, 2], [1]],
      fam: [[0, 0, 0], [0]],
      group: [[0, 0, 0], [0]],
      twins: null,
      groupMember: [[false, false, false], [false]],
    };
    const connectors = draw(layout, new Set());
    expect(connectors.groupLines).toEqual([]);
    expect(
      connectors.parentChildLines.flatMap((line) => line.parentLink),
    ).toEqual([]);
    expect(connectors.auxiliaryLines.map((line) => line.endpointIds)).toEqual(
      expect.arrayContaining([
        ['ann', 'c1'],
        ['bob', 'c1'],
      ]),
    );
  });
});
