import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { hasTag, isTaggedError } from '../errors.ts';

class Refused extends Schema.TaggedError<Refused>()('Refused', {
  reason: Schema.String,
}) {}

describe('the catch-block guards', () => {
  it('finds a string _tag and nothing else', () => {
    expect(hasTag(new Refused({ reason: 'x' }))).toBe(true);
    expect(hasTag({ _tag: 'Anything' })).toBe(true);
    expect(hasTag({ _tag: 42 })).toBe(false);
    expect(hasTag(new Error('no tag'))).toBe(false);
    expect(hasTag(null)).toBe(false);
    expect(hasTag('Refused')).toBe(false);
  });

  it('matches one tag and keeps it as a literal', () => {
    const caught: unknown = new Refused({ reason: 'x' });
    expect(isTaggedError(caught, 'Refused')).toBe(true);
    expect(isTaggedError(caught, 'Other')).toBe(false);
    if (isTaggedError(caught, 'Refused')) {
      // The guard narrows to the literal, so a screen can switch on it.
      const tag: 'Refused' = caught._tag;
      expect(tag).toBe('Refused');
    }
  });
});
