import type {
  ParentConnection,
  PartnerConnection,
  PedigreeEdgeType,
} from './types';
import { relativeRaisers } from './utils';

/**
 * Whoever a line in the drawing comes from: one person, a recorded couple
 * whose two partners hold the same kind of tie to the child, or two birth
 * parents with no partnership recorded (a pair). `parents` holds one person,
 * or the two of a couple or a pair in the order their ties were recorded.
 */
export type LineOwner = {
  parents: number[];
  kind: PedigreeEdgeType;
};

/** A child's lines: their one line of descent, and a line for every other
 * owner of a tie to them. */
export type ChildLines = {
  descent?: LineOwner;
  lines: LineOwner[];
};

/** Birth ties (a gamete or the pregnancy) are drawn solid and may share a
 * course; raising ties (adoptive, social) are drawn dashed and never do. */
export const isBirthTie = (kind: PedigreeEdgeType) =>
  kind === 'biological' || kind === 'donor' || kind === 'surrogate';

/** The key two owners with the same parents share, whatever the kind. */
export const ownerKey = (owner: LineOwner) =>
  owner.parents.toSorted((a, b) => a - b).join('+');

/**
 * Who each child's lines come from (Rule 1, then the owner model). This is
 * the one place the drawing decides it; the layout and the connectors both
 * read it.
 *
 * The line of descent comes from:
 * 1. the birth parents, when someone who raises the child is a relative of
 *    a birth parent (ruling 18, widened);
 * 2. otherwise the adopters, when the child was adopted and no birth parent
 *    is partnered with an adopter (ruling 12);
 * 3. otherwise the biological parents, and failing those the carrier;
 * 4. otherwise the raisers, adoptive before social.
 *
 * Within the kind chosen, the owner is the recorded couple who both hold it,
 * or (for birth parents only) the two who hold it with no partnership
 * recorded, or failing those the parent recorded first. Every other tie is
 * drawn by a line of its owner's: a recorded couple who both hold that kind
 * of tie, two birth parents with no partnership recorded, or one person.
 */
export function lineOwnersOf(
  parents: ParentConnection[][],
  partners: readonly PartnerConnection[],
): ChildLines[] {
  const partnered = (a: number, b: number) =>
    partners.some(
      ({ partnerIndex1: p, partnerIndex2: q }) =>
        (p === a && q === b) || (p === b && q === a),
    );
  const raisedByRelatives = relativeRaisers(parents, partners);

  // The owner among parents holding one kind of tie: a recorded couple,
  // two birth parents with no partnership recorded, or the first.
  function ownerAmong(holding: ParentConnection[]): LineOwner {
    const kind = holding[0]!.edgeType;
    for (const a of holding) {
      for (const b of holding) {
        if (a !== b && partnered(a.parentIndex, b.parentIndex)) {
          return { parents: [a.parentIndex, b.parentIndex], kind };
        }
      }
    }
    if (holding.length === 2 && kind === 'biological') {
      return {
        parents: [holding[0]!.parentIndex, holding[1]!.parentIndex],
        kind,
      };
    }
    return { parents: [holding[0]!.parentIndex], kind };
  }

  return parents.map((conns, child) => {
    const ofKind = (kinds: PedigreeEdgeType[]) =>
      conns.filter((p) => kinds.includes(p.edgeType));
    const biological = ofKind(['biological']);
    const adopters = ofKind(['adoptive']);
    const raisers = [...adopters, ...ofKind(['social'])];
    const carriers = conns.filter(
      (p) => p.edgeType === 'surrogate' && p.isGestationalCarrier,
    );

    let chosen: ParentConnection[] = [];
    if (raisedByRelatives[child]!.size > 0) {
      chosen = biological;
    } else if (
      adopters.length > 0 &&
      !biological.some((birth) =>
        adopters.some((adopter) =>
          partnered(birth.parentIndex, adopter.parentIndex),
        ),
      )
    ) {
      chosen = adopters;
    } else if (biological.length > 0) {
      chosen = biological;
    } else if (carriers.length > 0) {
      chosen = carriers;
    } else if (raisers.length > 0) {
      chosen = ofKind([raisers[0]!.edgeType]);
    }

    const descent = chosen.length > 0 ? ownerAmong(chosen) : undefined;

    // Every other tie, by owner.
    const rest = conns.filter(
      (p) =>
        !(
          descent &&
          descent.parents.includes(p.parentIndex) &&
          p.edgeType === descent.kind
        ),
    );
    const lines: LineOwner[] = [];
    const drawn = new Set<ParentConnection>();
    for (const tie of rest) {
      if (drawn.has(tie)) continue;
      drawn.add(tie);
      const other = rest.find(
        (candidate) =>
          !drawn.has(candidate) &&
          candidate.edgeType === tie.edgeType &&
          candidate.parentIndex !== tie.parentIndex &&
          (partnered(candidate.parentIndex, tie.parentIndex) ||
            (tie.edgeType === 'biological' &&
              !rest.some(
                (third) =>
                  third !== tie &&
                  third !== candidate &&
                  third.edgeType === 'biological',
              ))),
      );
      if (other) drawn.add(other);
      lines.push({
        parents: other
          ? [tie.parentIndex, other.parentIndex]
          : [tie.parentIndex],
        kind: tie.edgeType,
      });
    }
    return { ...(descent ? { descent } : {}), lines };
  });
}
