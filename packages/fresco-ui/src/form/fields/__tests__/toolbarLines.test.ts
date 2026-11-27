import { describe, expect, it } from 'vitest';

import {
  placeToolbarRules,
  type ToolbarLinePart,
} from '../richText/toolbarLines';

const rule: ToolbarLinePart = { kind: 'rule' };
const control = (width: number): ToolbarLinePart => ({
  kind: 'control',
  width,
});

describe('placeToolbarRules', () => {
  it('ends the line with the rule before the first control of all', () => {
    expect(placeToolbarRules([rule, control(40)], 400, 12)).toEqual([
      'lineEnd',
    ]);
  });

  it('draws a rule between two controls of a line', () => {
    expect(
      placeToolbarRules([rule, control(40), rule, control(40)], 400, 12),
    ).toEqual(['lineEnd', 'between']);
  });

  it('ends the line with a rule whose group would not fit after it', () => {
    // 40 + 12 + 40 is 92: the second group starts the next line.
    expect(
      placeToolbarRules([rule, control(40), rule, control(40)], 91, 12),
    ).toEqual(['lineEnd', 'lineEnd']);
    expect(
      placeToolbarRules([rule, control(40), rule, control(40)], 92, 12),
    ).toEqual(['lineEnd', 'between']);
  });

  it('counts a control that wraps inside a group as starting a line, with no space before it', () => {
    // The group's second control starts the second line; the rule after it
    // then fits on that line.
    expect(
      placeToolbarRules(
        [rule, control(40), control(40), rule, control(20)],
        60,
        12,
      ),
    ).toEqual(['lineEnd', 'lineEnd']);
    expect(
      placeToolbarRules(
        [rule, control(40), control(40), control(40), rule, control(20)],
        100,
        12,
      ),
    ).toEqual(['lineEnd', 'between']);
  });

  it('wraps the controls of a group one at a time, not as one piece', () => {
    // A group of three: its first control fits after the rule on the first
    // line, the other two do not.
    expect(
      placeToolbarRules(
        [rule, control(50), rule, control(30), control(30), control(30)],
        100,
        12,
      ),
    ).toEqual(['lineEnd', 'between']);
  });
});
