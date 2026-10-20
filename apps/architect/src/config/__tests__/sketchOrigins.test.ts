import { describe, expect, it } from 'vitest';

import { isAllowedSketchOrigin, SKETCH_DEV_ORIGIN } from '../sketchOrigins';

describe('isAllowedSketchOrigin', () => {
  it.each([
    'https://sketch.networkcanvas.com',
    'https://sketch.networkcanvas.dev',
    'https://sketch-networkcanvas.netlify.app',
    'https://deploy-preview-12--sketch-networkcanvas.netlify.app',
    'https://main--sketch-networkcanvas.netlify.app',
  ])('accepts %s', (origin) => {
    expect(isAllowedSketchOrigin(origin, { dev: false })).toBe(true);
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
    expect(isAllowedSketchOrigin(origin, { dev: true })).toBe(false);
  });

  it('accepts the local Sketch dev server only in a development build', () => {
    expect(isAllowedSketchOrigin(SKETCH_DEV_ORIGIN, { dev: true })).toBe(true);
    expect(isAllowedSketchOrigin(SKETCH_DEV_ORIGIN, { dev: false })).toBe(
      false,
    );
    expect(isAllowedSketchOrigin('http://localhost:5173', { dev: true })).toBe(
      false,
    );
  });
});
