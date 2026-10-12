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

    it("keeps alignments that cross one another's lines of descent apart", () => {
      // 0→1 and 2→3; person 4 is 0's and 3's, person 5 is 1's, 2's and 4's.
      // Aligning 0 with 3 and 1 with 2 would put 3 above 2 and 2 level with
      // 1, below 0: only one of the two can hold.
      const bio = (parentIndex: number): ParentConnection => ({
        parentIndex,
        edgeType: 'biological',
      });
      const parents: ParentConnection[][] = [
        [],
        [bio(0)],
        [],
        [bio(2)],
        [bio(0), bio(3)],
        [bio(1), bio(2), bio(4)],
      ];
      const depth = kindepth(parents, true);
      expectChildrenBelowParents(parents, depth);
      expect(depth[0]).toBe(depth[3]);
    });

    it("moves a parent's own ancestors, and their other descendants, down with them", () => {
      // a1=0, a2=1, p=2 (a1+a2), s=3 (a1 alone), t=4 (s), c0=5, c1=6 (c0),
      // q=7 (c1), z=8 (p+q). Aligning p with q moves p's parents down too,
      // so s and t must follow a1.
      const bio = (parentIndex: number): ParentConnection => ({
        parentIndex,
        edgeType: 'biological',
      });
      const parents: ParentConnection[][] = [
        [],
        [],
        [bio(0), bio(1)],
        [bio(0)],
        [bio(3)],
        [],
        [bio(5)],
        [bio(6)],
        [bio(2), bio(7)],
      ];
      const depth = kindepth(parents, true);
      expectChildrenBelowParents(parents, depth);
      expect(depth[2]).toBe(depth[7]);
      expect(depth[0]).toBe(depth[2]! - 1);
    });

    it('keeps every child below every parent in any pedigree', () => {
      // Random acyclic pedigrees from a fixed seed: every person's parents
      // come earlier, with any mix of one to three of them.
      let seed = 1;
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        return seed / 2 ** 31;
      };
      for (let trial = 0; trial < 2000; trial++) {
        const n = 3 + Math.floor(random() * 8);
        const parents: ParentConnection[][] = Array.from(
          { length: n },
          (_, i) => {
            if (i === 0 || random() < 0.3) return [];
            const count = random() < 0.15 ? 3 : random() < 0.7 ? 2 : 1;
            const chosen = new Set<number>();
            for (let k = 0; k < count; k++) {
              chosen.add(Math.floor(random() * i));
            }
            return [...chosen].map((parentIndex) => ({
              parentIndex,
              edgeType: 'biological',
            }));
          },
        );
        expectChildrenBelowParents(parents, kindepth(parents, true));
      }
    });
  });

  describe('a parent shared by two parent groups', () => {
    const bio = (parentIndex: number): ParentConnection => ({
      parentIndex,
      edgeType: 'biological',
    });

    it('aligns the second group after the shared parent moves for the first', () => {
      // grandmother → hannah; hannah + shared → you; shared + amy + jo → zoe.
      // Moving shared down to hannah's row leaves zoe's group unaligned until
      // amy and jo follow.
      const parents: ParentConnection[][] = [
        [],
        [bio(0)],
        [],
        [bio(1), bio(2)],
        [bio(2), bio(5), bio(6)],
        [],
        [],
      ];
      expect(kindepth(parents, true)).toEqual([0, 1, 1, 2, 2, 1, 1]);
    });

    it('aligns parents passed as also aligned without letting them set depth', () => {
      // As above, but shared is only a donor: it joins each group's row and
      // sets neither child's depth.
      const donor = (parentIndex: number): ParentConnection => ({
        parentIndex,
        edgeType: 'donor',
      });
      const parents: ParentConnection[][] = [
        [],
        [bio(0)],
        [],
        [bio(1)],
        [bio(5), bio(6)],
        [],
        [],
      ];
      const alsoAligned: ParentConnection[][] = [
        [],
        [],
        [],
        [donor(2)],
        [donor(2)],
        [],
        [],
      ];
      expect(kindepth(parents, true, alsoAligned)).toEqual([
        0, 1, 1, 2, 2, 1, 1,
      ]);
    });

    it('aligns a group that shares a parent pair with another group (confirm-r1-67)', () => {
      // grace → you. you, nadia and ethan's stand-in father are ethan's
      // parents; you and nadia adopt lily. Both groups hold you and nadia,
      // and the stand-in, a partner of no one, must still join their row.
      const social = (parentIndex: number): ParentConnection => ({
        parentIndex,
        edgeType: 'social',
      });
      const adoptive = (parentIndex: number): ParentConnection => ({
        parentIndex,
        edgeType: 'adoptive',
      });
      const parents: ParentConnection[][] = [
        [],
        [bio(0)],
        [],
        [],
        [social(1), bio(2), bio(3)],
        [adoptive(1), adoptive(2)],
      ];
      expect(kindepth(parents, true)).toEqual([0, 1, 1, 1, 2, 2]);
    });
  });
});
