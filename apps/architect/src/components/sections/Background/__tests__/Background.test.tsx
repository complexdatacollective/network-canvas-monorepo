import { describe, expect, it } from 'vitest';

import { allowsBackgroundImage } from '../Background';

// The Narrative and NetworkComposer stage schemas forbid a background image
// (strict objects with only concentricCircles/skewedTowardCenter). The shared
// Background section must therefore not offer the image option for those
// stages.
describe('allowsBackgroundImage', () => {
  it('forbids a background image for Narrative stages', () => {
    expect(allowsBackgroundImage('Narrative')).toBe(false);
  });

  it('forbids a background image for NetworkComposer stages', () => {
    expect(allowsBackgroundImage('NetworkComposer')).toBe(false);
  });

  it('allows a background image for Sociogram stages', () => {
    expect(allowsBackgroundImage('Sociogram')).toBe(true);
  });
});
