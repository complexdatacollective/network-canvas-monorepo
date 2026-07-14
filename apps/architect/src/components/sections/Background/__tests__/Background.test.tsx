import { describe, expect, it } from 'vitest';

import { allowsBackgroundImage } from '../Background';

// The Narrative stage schema forbids a background image (strict object with
// only concentricCircles/skewedTowardCenter). The shared Background section
// must therefore not offer the image option for Narrative stages.
describe('allowsBackgroundImage', () => {
  it('forbids a background image for Narrative stages', () => {
    expect(allowsBackgroundImage('Narrative')).toBe(false);
  });

  it('allows a background image for Sociogram stages', () => {
    expect(allowsBackgroundImage('Sociogram')).toBe(true);
  });

  it('allows a background image for NetworkComposer stages', () => {
    expect(allowsBackgroundImage('NetworkComposer')).toBe(true);
  });
});
