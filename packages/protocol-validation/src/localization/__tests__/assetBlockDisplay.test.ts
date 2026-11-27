import { describe, expect, it } from 'vitest';

import type { AssetBlock } from '../assetBlock.ts';
import {
  assetBlockFile,
  assetBlockSettings,
  assetInManifest,
} from '../assetBlockDisplay.ts';

type Entry = Readonly<{ type?: string; name?: string }>;

const MANIFEST: Readonly<Record<string, Entry | undefined>> = {
  map: { type: 'image', name: 'map.png' },
  tune: { type: 'audio', name: 'tune.mp3' },
  clip: { type: 'video', name: 'clip.mp4' },
  people: { type: 'network', name: 'people.csv' },
  key: { type: 'apikey', name: 'Mapbox' },
  untyped: { name: 'untyped' },
};

// Ids every object answers to through its prototype, and none of which the
// manifest above holds.
const INHERITED = [
  'constructor',
  '__proto__',
  'toString',
  'hasOwnProperty',
  'valueOf',
];

describe('assetInManifest', () => {
  it('reads the entry the manifest holds for an id', () => {
    expect(assetInManifest(MANIFEST, 'people')).toEqual({
      type: 'network',
      name: 'people.csv',
    });
  });

  it('reads nothing for an id the manifest does not hold', () => {
    expect(assetInManifest(MANIFEST, 'gone')).toBeUndefined();
    expect(assetInManifest(MANIFEST, '')).toBeUndefined();
  });

  it('reads nothing without a manifest', () => {
    expect(assetInManifest(undefined, 'map')).toBeUndefined();
  });

  it.each(INHERITED)('reads nothing for "%s", which it only inherits', (id) => {
    expect(assetInManifest(MANIFEST, id)).toBeUndefined();
  });

  it('reads an entry the manifest holds under an inherited name', () => {
    // As JSON gives them: own properties, not the prototype's.
    const manifest: Record<string, Entry> = {};
    Object.defineProperty(manifest, '__proto__', {
      value: { type: 'image', name: 'proto.png' },
      enumerable: true,
    });
    Object.defineProperty(manifest, 'constructor', {
      value: { type: 'audio', name: 'c.mp3' },
      enumerable: true,
    });
    expect(assetInManifest(manifest, '__proto__')).toEqual({
      type: 'image',
      name: 'proto.png',
    });
    expect(assetInManifest(manifest, 'constructor')).toEqual({
      type: 'audio',
      name: 'c.mp3',
    });
  });

  it('reads nothing from an object without a prototype that lacks the id', () => {
    const manifest: Record<string, Entry> = Object.create(null);
    expect(assetInManifest(manifest, 'constructor')).toBeUndefined();
  });
});

describe('assetBlockFile', () => {
  it.each([
    ['map', 'image', 'map.png'],
    ['tune', 'audio', 'tune.mp3'],
    ['clip', 'video', 'clip.mp4'],
  ])('names "%s" as a file a page shows: %s', (id, kind, name) => {
    expect(assetBlockFile(MANIFEST, id)).toEqual({ kind, name });
  });

  it('names no file the manifest does not hold', () => {
    expect(assetBlockFile(MANIFEST, 'gone')).toBeUndefined();
    expect(assetBlockFile(undefined, 'map')).toBeUndefined();
  });

  it.each(['people', 'key', 'untyped'])(
    'names no file for "%s", which a page cannot show',
    (id) => {
      expect(assetBlockFile(MANIFEST, id)).toBeUndefined();
    },
  );

  it.each(INHERITED)('names no file for "%s"', (id) => {
    expect(assetBlockFile(MANIFEST, id)).toBeUndefined();
  });

  it('keeps an entry without a name as it is', () => {
    expect(assetBlockFile({ bare: { type: 'image' } }, 'bare')).toEqual({
      kind: 'image',
      name: undefined,
    });
  });
});

describe('assetBlockSettings', () => {
  it('gives the defaults for every setting a block leaves out', () => {
    expect(assetBlockSettings({})).toEqual({
      size: undefined,
      autoplay: true,
      loop: true,
    });
  });

  it('keeps every setting a block writes', () => {
    expect(
      assetBlockSettings({
        size: 'small',
        autoplay: false,
        loop: false,
      }),
    ).toEqual({ size: 'small', autoplay: false, loop: false });
  });

  it('keeps a setting written at its default', () => {
    expect(assetBlockSettings({ autoplay: true, loop: true })).toEqual({
      size: undefined,
      autoplay: true,
      loop: true,
    });
  });

  it('reads each setting on its own', () => {
    expect(assetBlockSettings({ loop: false })).toEqual({
      size: undefined,
      autoplay: true,
      loop: false,
    });
    expect(assetBlockSettings({ size: 'large' })).toEqual({
      size: 'large',
      autoplay: true,
      loop: true,
    });
  });

  it('reads a block as the grammar reads it, leaving its file aside', () => {
    const block: AssetBlock = { assetId: 'map', description: 'A map' };
    expect(assetBlockSettings(block)).toEqual({
      size: undefined,
      autoplay: true,
      loop: true,
    });
  });
});
