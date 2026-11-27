/**
 * Where the rule before each group of a toolbar goes, once the toolbar's
 * controls are laid out in lines.
 *
 * The controls of a toolbar sit next to each other in one line that wraps,
 * a control at a time, where the bar is narrower than they are together. A
 * rule separates one group from the next, in a space of its own between two
 * controls. At the end of a line it would separate a group from nothing, so
 * there it is not drawn, and it ends the line instead: the group it starts
 * begins the next line, at the bar's edge.
 *
 * Whether a rule ends a line depends on where the line breaks, which depends
 * on the rules drawn before it, so the lines are worked out here, from the
 * width of each control, the way the bar lays them out: a line takes each
 * control in turn while it fits, and a group's first control only with the
 * space for its rule.
 */

/** A rule's place: between two controls of a line, or ending a line. */
type ToolbarRulePlace = 'between' | 'lineEnd';

/** One part of the toolbar's line, in order. */
export type ToolbarLinePart =
  | Readonly<{ kind: 'rule' }>
  | Readonly<{ kind: 'control'; width: number }>;

/** A width laid out in a line fits it when it is no wider, allowing for rounding. */
const FITS_WITHIN = 0.01;

/**
 * The place of each rule of the line, in order: `lineEnd` for one before the
 * first control of all, or one whose group does not fit at the end of the
 * line, and `between` for every other.
 */
export function placeToolbarRules(
  parts: readonly ToolbarLinePart[],
  lineWidth: number,
  ruleWidth: number,
): ToolbarRulePlace[] {
  const places: ToolbarRulePlace[] = [];
  // How much of the current line is taken.
  let taken = 0;
  for (const [index, part] of parts.entries()) {
    if (part.kind === 'control') {
      // A control that does not fit begins the next line.
      if (taken > 0 && taken + part.width > lineWidth + FITS_WITHIN) taken = 0;
      taken += part.width;
      continue;
    }
    const next = parts
      .slice(index + 1)
      .find((later) => later.kind === 'control');
    const first = next?.kind === 'control' ? next.width : 0;
    if (taken > 0 && taken + ruleWidth + first <= lineWidth + FITS_WITHIN) {
      places.push('between');
      taken += ruleWidth;
    } else {
      places.push('lineEnd');
      taken = 0;
    }
  }
  return places;
}
