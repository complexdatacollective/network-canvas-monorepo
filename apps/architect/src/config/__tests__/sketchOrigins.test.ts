import { describe, expect, it } from 'vitest';

import { isAllowedSketchOrigin, SKETCH_DEV_ORIGIN } from '../sketchOrigins';

const production = { dev: false, allowPreviews: false };
const preview = { dev: false, allowPreviews: true };

describe('isAllowedSketchOrigin', () => {
  it.each([
    'https://sketch.networkcanvas.com',
    'https://sketch.networkcanvas.dev',
    'https://sketch-networkcanvas.netlify.app',
  ])('accepts %s in every build', (origin) => {
    expect(isAllowedSketchOrigin(origin, production)).toBe(true);
    expect(isAllowedSketchOrigin(origin, preview)).toBe(true);
  });

  it.each([
    'https://deploy-preview-12--sketch-networkcanvas.netlify.app',
    'https://main--sketch-networkcanvas.netlify.app',
  ])('accepts %s only when previews are allowed', (origin) => {
    expect(isAllowedSketchOrigin(origin, preview)).toBe(true);
    expect(isAllowedSketchOrigin(origin, production)).toBe(false);
  });

  it.each([
    'http://sketch.networkcanvas.com',
    'https://sketch.networkcanvas.com.attacker.example',
    'https://evil-sketch.networkcanvas.com',
    'https://sketch.networkcanvas.com:8443',
    'https://evil.example/--sketch-networkcanvas.netlify.app',
    'https://a.b--sketch-networkcanvas.netlify.app',
    'https://x--sketch-networkcanvas.netlify.app.attacker.example',
    'https://Main--sketch-networkcanvas.netlify.app',
    'https://other-site.netlify.app',
    'null',
    '',
  ])('rejects %s', (origin) => {
    expect(
      isAllowedSketchOrigin(origin, { dev: true, allowPreviews: true }),
    ).toBe(false);
  });

  it('accepts the local Sketch dev server only in a development build', () => {
    expect(
      isAllowedSketchOrigin(SKETCH_DEV_ORIGIN, {
        dev: true,
        allowPreviews: true,
      }),
    ).toBe(true);
    expect(isAllowedSketchOrigin(SKETCH_DEV_ORIGIN, preview)).toBe(false);
    expect(
      isAllowedSketchOrigin('http://localhost:5173', {
        dev: true,
        allowPreviews: true,
      }),
    ).toBe(false);
  });
});
