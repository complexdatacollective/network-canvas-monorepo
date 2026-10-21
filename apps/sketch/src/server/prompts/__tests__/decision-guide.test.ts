// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTE_KINDS,
  DESIGN_STAGE_KINDS,
  MAP_REGIONS,
  OPERATORS,
} from '../../design/schema.ts';
import { DECISION_GUIDE } from '../decision-guide.ts';

// Enum values that live inline in StageSchema / SkipLogicSchema rather than
// in an exported const. Keep in sync with ../../design/schema.ts.
const INLINE_ENUM_VALUES = [
  // nameGenerator.method
  'quick_add',
  'form',
  'roster',
  // relationshipCensus.method
  'every_pair',
  'one_at_a_time',
  'with_strength',
  // sociogram prompt task
  'position',
  'connect',
  'highlight',
  // skipLogic.mode / whenSkipped
  'always_show',
  'show_only_if',
  'skip_if',
  'next_stage',
  'end_interview',
  // information.role
  'welcome',
  'instructions',
  'transition',
  'closing',
] as const;

const mentions = (word: string) =>
  new RegExp(`(^|[^A-Za-z_])${word}([^A-Za-z_]|$)`).test(DECISION_GUIDE);

describe('DECISION_GUIDE', () => {
  it('starts with the version header', () => {
    expect(DECISION_GUIDE.split('\n')[0]).toMatch(
      /^# Sketch decision guide v\d+$/,
    );
  });

  it.each(DESIGN_STAGE_KINDS)('mentions stage kind %s', (kind) => {
    expect(mentions(kind)).toBe(true);
  });

  it.each(ATTRIBUTE_KINDS)('mentions attribute kind %s', (kind) => {
    expect(mentions(kind)).toBe(true);
  });

  it.each([...OPERATORS, ...MAP_REGIONS, ...INLINE_ENUM_VALUES])(
    'mentions enum value %s',
    (value) => {
      expect(mentions(value)).toBe(true);
    },
  );

  it('stays well under the token budget', () => {
    expect(DECISION_GUIDE.length).toBeLessThan(27000);
  });

  it('is byte-stable: no interpolation leftovers', () => {
    expect(DECISION_GUIDE).not.toContain('${');
    expect(DECISION_GUIDE).not.toContain('undefined');
  });

  it('never asks for reasoning (avoids reasoning-extraction refusals)', () => {
    expect(DECISION_GUIDE.toLowerCase()).not.toContain('reasoning');
  });
});
