import { describe, expect, it } from 'vitest';

import { allowsBackgroundImage } from '../Background';

describe('allowsBackgroundImage', () => {
  it('allows a background image for Narrative stages', () => {
    expect(allowsBackgroundImage('Narrative')).toBe(true);
  });

  it('allows a background image for Sociogram stages', () => {
    expect(allowsBackgroundImage('Sociogram')).toBe(true);
  });

  it('allows a background image for NetworkComposer stages', () => {
    expect(allowsBackgroundImage('NetworkComposer')).toBe(true);
  });

  it('does not enable background images for unrelated stages', () => {
    expect(allowsBackgroundImage('Information')).toBe(false);
  });
});
