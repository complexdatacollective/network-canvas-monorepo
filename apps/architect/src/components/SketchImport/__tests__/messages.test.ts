import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { parseSketchMessage, toExtractedAssets } from '../messages';

const protocol = {
  name: 'P',
  schemaVersion: 8,
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {
    photo: { type: 'image', name: 'Venue photo', source: 'venue.svg' },
  },
} as unknown as CurrentProtocol;

describe('parseSketchMessage', () => {
  it('ignores anything that is not a Sketch payload', () => {
    expect(parseSketchMessage(null).kind).toBe('ignore');
    expect(parseSketchMessage('x').kind).toBe('ignore');
    expect(parseSketchMessage({ type: 'sketch-import:ready' }).kind).toBe(
      'ignore',
    );
  });

  it('accepts a well-formed payload', () => {
    const parsed = parseSketchMessage({
      type: 'sketch-import:payload',
      version: 1,
      protocol,
      name: 'Study',
      assets: [],
    });
    expect(parsed).toMatchObject({
      kind: 'payload',
      payload: { protocol, name: 'Study', assets: [] },
    });
  });

  it('marks a malformed payload invalid', () => {
    expect(
      parseSketchMessage({
        type: 'sketch-import:payload',
        version: 1,
        protocol,
        name: 'Study',
        assets: [{ id: '', name: 'a', data: new Blob() }],
      }).kind,
    ).toBe('invalid');
  });
});

describe('toExtractedAssets', () => {
  it('names an asset by its manifest name and types an untyped Blob from its source', () => {
    const [asset] = toExtractedAssets(protocol, [
      { id: 'photo', name: 'venue.svg', data: new Blob(['x']) },
    ]);
    expect(asset?.name).toBe('Venue photo');
    expect(asset).toBeDefined();
    expect((asset!.data as Blob).type).toBe('image/svg+xml');
  });

  it("falls back to Sketch's file name for an asset the manifest does not list", () => {
    const blob = new Blob(['x'], { type: 'text/csv' });
    const [asset] = toExtractedAssets(protocol, [
      { id: 'extra', name: 'extra.csv', data: blob },
    ]);
    expect(asset).toEqual({ id: 'extra', name: 'extra.csv', data: blob });
  });
});
