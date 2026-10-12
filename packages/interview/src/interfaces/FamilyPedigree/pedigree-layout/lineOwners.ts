import type {
  ParentConnection,
  PartnerConnection,
  PedigreeEdgeType,
} from './types';
import { relativeRaisers } from './utils';

/**
 * Whoever a line in the drawing comes from: one person, a recorded couple
 * whose two partners both hold birth ties, or both the same raising tie, to
 * the child, or two birth parents with no partnership recorded (a pair).
 * `parents` holds one person, or the two of a couple or a pair in the order
 * their ties were recorded. `kind` is the style the line is drawn in: one of
 * the birth kinds for a line that carries birth ties, or its raising kind.
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

/**
 * Whether a tie is a birth tie, and who carried the child, are read from the
 * tie's recorded kind and its carried flag here and nowhere else (Round 5
 * ruling 1, Josh, 12 Oct 2026). Carrying the pregnancy is a birth tie,
 * whatever else the parent is to the child: an adoptive or social parent who
 * carried is drawn as the child's carrier, solid. Every other tie is drawn
 * as recorded. The layout reads each tie through this as it takes the
 * family in, so every later reader of a tie's kind sees the kind it is
 * drawn as.
 */
export function drawnKind(
  kind: PedigreeEdgeType,
  carried: boolean,
): PedigreeEdgeType {
  return carried && !isBirthTie(kind) ? 'surrogate' : kind;
}

/** Who carried the child, whatever the kind of their tie (a biological
 * parent, a donor who carried, a surrogate, or a parent who raises the child
 * and carried): read from the carried flag. */
const carrierAmong = (conns: ParentConnection[]) =>
  conns.find((p) => p.isGestationalCarrier === true);

/** A tie that passes on genes: a biological parent's or a donor's. */
const isGenetic = (p: ParentConnection) =>
  p.edgeType === 'biological' || p.edgeType === 'donor';

/** The key two owners with the same parents share, whatever the kind. */
export const ownerKey = (owner: LineOwner) =>
  owner.parents.toSorted((a, b) => a - b).join('+');

/**
 * Who each child's lines come from (Rule 1, then the owner model). This is
 * the one place the drawing decides it; the layout and the connectors both
 * read it.
 *
 * The line of descent comes from:
 * 1. the birth owners (below), when someone who raises the child is a
 *    relative of a birth parent (ruling 18, widened);
 * 2. otherwise the adopters, when the child was adopted and no birth parent
 *    (a biological parent, or whoever carried the child) is partnered with
 *    an adopter (ruling 12);
 * 3. otherwise the birth owners;
 * 4. otherwise the raisers, adoptive before social.
 *
 * The birth owners (Round 5 ruling 2, after Bennett et al. 2022, Fig. 5):
 * whoever carried the pregnancy, with their partner when that partner is
 * the child's other genetic parent (their partnership line then carries the
 * line of descent), or with the other biological parent as a pair when
 * both are the child's biological parents and no partnership is recorded
 * between them. With no carrier recorded, the biological parents: the
 * recorded couple who both hold the tie, or the two who hold it with no
 * partnership recorded, or failing those the parent recorded first.
 *
 * Within raising kinds, the owner is the recorded couple who both hold the
 * kind chosen, or failing those the parent recorded first. Every other tie
 * is drawn by a line of its owner's: a recorded couple who both hold that
 * kind of tie, two birth parents with no partnership recorded, or one
 * person.
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

  // The owners' ties among parents holding one kind of tie: a recorded
  // couple, two biological parents with no partnership recorded, or the
  // first.
  function ownerAmong(holding: ParentConnection[]): ParentConnection[] {
    if (holding.length === 0) return [];
    for (const a of holding) {
      for (const b of holding) {
        if (a !== b && partnered(a.parentIndex, b.parentIndex)) return [a, b];
      }
    }
    if (holding.length === 2 && holding[0]!.edgeType === 'biological') {
      return [holding[0]!, holding[1]!];
    }
    return [holding[0]!];
  }

  return parents.map((conns, child) => {
    const ofKind = (kinds: PedigreeEdgeType[]) =>
      conns.filter((p) => kinds.includes(p.edgeType));
    const biological = ofKind(['biological']);
    const adopters = ofKind(['adoptive']);
    const raisers = [...adopters, ...ofKind(['social'])];

    // The birth owners' ties: the carrier's, with a partner who is the
    // other genetic parent, or with the other biological parent of a pair.
    const birthTies = (): ParentConnection[] => {
      const carrier = carrierAmong(conns);
      if (!carrier) return ownerAmong(biological);
      const others = conns.filter((p) => p !== carrier);
      const partner = others.find(
        (p) => isGenetic(p) && partnered(p.parentIndex, carrier.parentIndex),
      );
      if (partner) return [carrier, partner];
      const otherBiological = others.filter((p) => p.edgeType === 'biological');
      if (carrier.edgeType === 'biological' && otherBiological.length === 1) {
        return [carrier, otherBiological[0]!];
      }
      return [carrier];
    };

    let descentTies: ParentConnection[] = [];
    if (raisedByRelatives[child]!.size > 0) {
      descentTies = birthTies();
    } else if (
      adopters.length > 0 &&
      !conns.some(
        (birth) =>
          (birth.edgeType === 'biological' || birth === carrierAmong(conns)) &&
          adopters.some((adopter) =>
            partnered(birth.parentIndex, adopter.parentIndex),
          ),
      )
    ) {
      descentTies = ownerAmong(adopters);
    } else if (carrierAmong(conns) || biological.length > 0) {
      descentTies = birthTies();
    } else if (raisers.length > 0) {
      descentTies = ownerAmong(ofKind([raisers[0]!.edgeType]));
    }

    const descent: LineOwner | undefined =
      descentTies.length > 0
        ? {
            parents: descentTies
              .toSorted((a, b) => conns.indexOf(a) - conns.indexOf(b))
              .map((p) => p.parentIndex),
            // A line of descent carrying a carrier's tie and a genetic one is
            // drawn as the genetic parent's (both are birth ties).
            kind:
              descentTies.find((p) => p.edgeType === 'biological')?.edgeType ??
              descentTies[0]!.edgeType,
          }
        : undefined;

    // Every other tie, by owner.
    const rest = conns.filter((p) => !descentTies.includes(p));
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
