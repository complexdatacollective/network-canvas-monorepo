import { describe, expect, it } from 'vitest';

import { kindepth } from '../kindepth';
import type { ParentConnection } from '../types';

describe('kindepth', () => {
  it('returns [0] for a single person', () => {
    expect(kindepth([[]])).toEqual([0]);
  });

  it('assigns depth 0 to founders, 1 to their children', () => {
    const parents: ParentConnection[][] = [
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
    ];
    expect(kindepth(parents)).toEqual([0, 0, 1]);
  });

  it('assigns increasing depth across generations', () => {
    const parents: ParentConnection[][] = [
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
    ];
    expect(kindepth(parents)).toEqual([0, 0, 1, 0, 2]);
  });

  it('handles single parent', () => {
    const parents: ParentConnection[][] = [
      [],
      [{ parentIndex: 0, edgeType: 'biological' }],
    ];
    expect(kindepth(parents)).toEqual([0, 1]);
  });

  it('handles 3 parents at same generation', () => {
    const parents: ParentConnection[][] = [
      [],
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
        { parentIndex: 2, edgeType: 'biological' },
      ],
    ];
    expect(kindepth(parents)).toEqual([0, 0, 0, 1]);
  });

  it('aligns parent group members to same depth when align=true', () => {
    // grandpa=0, grandma=1, parent1=2, parent2=3 (marry-in), child=4
    const parents: ParentConnection[][] = [
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
    ];
    const depth = kindepth(parents, true);
    expect(depth[2]).toBe(depth[3]);
    expect(depth[4]!).toBeGreaterThan(depth[2]!);
  });

  it('throws on cyclic pedigree', () => {
    const parents: ParentConnection[][] = [
      [{ parentIndex: 1, edgeType: 'biological' }],
      [{ parentIndex: 0, edgeType: 'biological' }],
    ];
    expect(() => kindepth(parents)).toThrow('Impossible pedigree');
  });

  it('treats auxiliary parents (donor/surrogate) the same for depth', () => {
    const parents: ParentConnection[][] = [
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'donor' },
      ],
    ];
    expect(kindepth(parents)).toEqual([0, 0, 1]);
  });

  it('handles a nuclear family', () => {
    const parents: ParentConnection[][] = [
      [],
      [],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
      [
        { parentIndex: 0, edgeType: 'biological' },
        { parentIndex: 1, edgeType: 'biological' },
      ],
    ];
    expect(kindepth(parents)).toEqual([0, 0, 1, 1, 1]);
  });

  describe('with align=true', () => {
    // Every child sits below each of its parents, whatever the edge.
    const expectChildrenBelowParents = (
      parents: ParentConnection[][],
      depth: number[],
    ) => {
      parents.forEach((conns, child) => {
        for (const p of conns) {
          expect(depth[child]!).toBeGreaterThan(depth[p.parentIndex]!);
        }
      });
    };

    it("keeps a daughter who carries her mother's baby below her mother", () => {
      // mum=0, daughter=1, baby=2 (mum's egg, carried by daughter)
      const parents: ParentConnection[][] = [
        [],
        [{ parentIndex: 0, edgeType: 'biological' }],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'surrogate', isGestationalCarrier: true },
        ],
      ];
      const depth = kindepth(parents, true);
      expect(depth).toEqual([0, 1, 2]);
    });

    it('keeps a son who donates to his mother below her', () => {
      // mum=0, partner=1, son=2 (mum's), baby=3 (mum + partner, son donor)
      const parents: ParentConnection[][] = [
        [],
        [],
        [{ parentIndex: 0, edgeType: 'biological' }],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'social' },
          { parentIndex: 2, edgeType: 'donor' },
        ],
      ];
      const depth = kindepth(parents, true);
      expectChildrenBelowParents(parents, depth);
      expect(depth[0]).toBe(depth[1]);
    });

    it('keeps the single-parent children of a moved marry-in below them', () => {
      // g1=0, g2=1, p=2 (g1+g2), q=3, c=4 (p+q), x=5, k=6 (x alone), z=7 (c+x)
      const parents: ParentConnection[][] = [
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
        [],
        [{ parentIndex: 5, edgeType: 'biological' }],
        [
          { parentIndex: 4, edgeType: 'biological' },
          { parentIndex: 5, edgeType: 'biological' },
        ],
      ];
      const depth = kindepth(parents, true);
      expectChildrenBelowParents(parents, depth);
      expect(depth[5]).toBe(depth[4]);
    });
  });
});
