import { Redacted } from 'effect';
import { describe, expect, it } from 'vitest';

import { parseNodeShapeSvg } from '@codaco/fresco-ui/node/nodeShapeSvg';

import type { ResourceDescriptor } from '../../types.ts';
import {
  checkNodeShapeSvg,
  isNodeShapeResource,
  prepareNodeShapeUpload,
} from '../nodeShapeResource.ts';

const HOME_SVG =
  '<svg viewBox="0 0 100 100"><path d="M10 50 L50 10 L90 50 V90 H10 Z" fill="var(--node-color, #e04f6d)"/><rect id="label-area" x="20" y="55" width="60" height="30" fill="#ffffff"/></svg>';

const messageId = (encoded: string) =>
  /protocolBuilder\.[A-Za-z.]+/.exec(encoded)?.[0];

const descriptor = (
  overrides: Partial<Pick<ResourceDescriptor, 'kind'>> &
    Readonly<{ name: string; source?: string }>,
): ResourceDescriptor => ({
  id: 'asset-1',
  kind: overrides.kind ?? 'image',
  name: Redacted.make(overrides.name),
  status: 'committed',
  ...(overrides.source === undefined
    ? {}
    : { source: Redacted.make(overrides.source) }),
});

describe('checkNodeShapeSvg', () => {
  it('accepts a clean file in its canonical form', () => {
    const result = checkNodeShapeSvg('home.svg', HOME_SVG);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(parseNodeShapeSvg(result.svg).issues).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.centredLabel).toBe(false);
  });

  it('removes unsupported content and says what kind', () => {
    const result = checkNodeShapeSvg(
      'risky.svg',
      '<svg viewBox="0 0 10 10"><script>alert(1)</script><style>.a{}</style><filter id="f"><feGaussianBlur/></filter><circle cx="5" cy="5" r="4" onclick="x()"/></svg>',
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.removed).toEqual(['scripts', 'styles', 'filters']);
    expect(result.centredLabel).toBe(true);
    expect(result.svg).not.toContain('script');
    expect(result.svg).not.toContain('onclick');
    expect(parseNodeShapeSvg(result.svg).issues).toEqual([]);
  });

  it('explains why a file cannot be used at all', () => {
    const failure = (source: string) => {
      const result = checkNodeShapeSvg('x.svg', source);
      return result.success ? undefined : messageId(result.error);
    };
    expect(failure('not an image')).toBe('protocolBuilder.customShapes.notSvg');
    expect(failure('<svg><circle r="2"/></svg>')).toBe(
      'protocolBuilder.customShapes.noViewBox',
    );
    expect(failure('<svg viewBox="0 0 10 10"><script/></svg>')).toBe(
      'protocolBuilder.customShapes.nothingToDraw',
    );
    expect(
      failure(
        `<svg viewBox="0 0 10 10"><path d="${'M0 0 '.repeat(12_000)}"/></svg>`,
      ),
    ).toBe('protocolBuilder.customShapes.tooLarge');
  });
});

describe('prepareNodeShapeUpload', () => {
  it('refuses a file that cannot fit the limit before reading it', () => {
    expect(
      'error' in prepareNodeShapeUpload('big.svg', new Uint8Array(10_000_000)),
    ).toBe(true);
    expect(
      'error' in
        prepareNodeShapeUpload('home.svg', new TextEncoder().encode(HOME_SVG)),
    ).toBe(false);
  });

  it('refuses a file whose canonical form is longer than the limit', () => {
    // 49,990 characters: under the limit as written, over it once the
    // namespace is written out.
    const head = '<svg viewBox="0 0 10 10"><path d="';
    const tail = '"/></svg>';
    const source = `${head}${'M0 0 '.repeat(20_000).slice(0, 49_990 - head.length - tail.length)}${tail}`;
    expect(parseNodeShapeSvg(source).success).toBe(true);
    const upload = prepareNodeShapeUpload(
      'near.svg',
      new TextEncoder().encode(source),
    );
    expect('error' in upload ? messageId(upload.error) : undefined).toBe(
      'protocolBuilder.customShapes.tooLarge',
    );
  });

  it('stores a clean file in its canonical form and notes it was imported', () => {
    const upload = prepareNodeShapeUpload(
      'home.svg',
      new TextEncoder().encode(HOME_SVG),
    );
    if ('error' in upload) throw new Error(upload.error);
    expect(upload.contentType).toBe('image/svg+xml');
    expect(
      parseNodeShapeSvg(new TextDecoder().decode(upload.bytes)).issues,
    ).toEqual([]);
    expect(upload.notice).toEqual({
      origin: 'imported',
      removed: [],
      centredLabel: false,
    });
  });

  it('says why a file cannot be used', () => {
    const failure = (bytes: Uint8Array) => {
      const upload = prepareNodeShapeUpload('x.svg', bytes);
      return 'error' in upload ? messageId(upload.error) : undefined;
    };
    expect(failure(new Uint8Array(10_000_000))).toBe(
      'protocolBuilder.customShapes.tooLarge',
    );
    expect(failure(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe(
      'protocolBuilder.customShapes.notSvg',
    );
    expect(
      failure(new TextEncoder().encode('<svg><circle r="2"/></svg>')),
    ).toBe('protocolBuilder.customShapes.noViewBox');
  });
});

describe('isNodeShapeResource', () => {
  it('offers SVG images and nothing else', () => {
    expect(isNodeShapeResource(descriptor({ name: 'home.svg' }))).toBe(true);
    expect(
      isNodeShapeResource(descriptor({ name: 'Home', source: 'abc.svg' })),
    ).toBe(true);
    expect(isNodeShapeResource(descriptor({ name: 'photo.png' }))).toBe(false);
    expect(
      isNodeShapeResource(descriptor({ name: 'home.svg', kind: 'video' })),
    ).toBe(false);
  });
});
