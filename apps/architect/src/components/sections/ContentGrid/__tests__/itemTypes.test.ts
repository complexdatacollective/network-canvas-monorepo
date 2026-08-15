import { describe, expect, it } from 'vitest';

import {
  familyPedigreeStage,
  informationStage,
} from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/modules/root';

import {
  CONTENT_SLOT_NAMES,
  denormalizeType,
  isContentSlotType,
  isManifestAssetType,
  normalizeType,
} from '../itemTypes';

describe('normalizeType', () => {
  it('collapses a text item to the text discriminant', () => {
    const result = normalizeType({ id: '1', content: 'Hello', type: 'text' });
    expect(result).toEqual({ id: '1', content: 'Hello', type: 'text' });
  });

  it('strips a stray size from a text item so it stays schema-valid', () => {
    const result = normalizeType({
      id: '1',
      content: 'Hello',
      type: 'text',
      size: 'SMALL',
    });
    expect(result).not.toHaveProperty('size');
    expect(result).toEqual({ id: '1', content: 'Hello', type: 'text' });
  });

  it.each(['image', 'video', 'audio'])(
    'collapses a %s item to the asset discriminant',
    (type: string) => {
      const result = normalizeType({ id: '1', content: 'asset-1', type });
      expect(result.type).toBe('asset');
    },
  );

  it.each(['image', 'video'])(
    'keeps a real display size on a %s item',
    (type: string) => {
      const result = normalizeType({
        id: '1',
        content: 'asset-1',
        type,
        size: 'MEDIUM',
      });
      expect(result).toEqual({
        id: '1',
        content: 'asset-1',
        type: 'asset',
        size: 'MEDIUM',
      });
    },
  );

  it('strips a stray size from an audio item since audio is not sizeable', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'audio',
      size: 'SMALL',
    });
    expect(result).not.toHaveProperty('size');
    expect(result.type).toBe('asset');
  });

  it('keeps a valid size on the ambiguous "asset" fallback (unresolved ref)', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'asset',
      size: 'LARGE',
    });
    expect(result).toEqual({
      id: '1',
      content: 'asset-1',
      type: 'asset',
      size: 'LARGE',
    });
  });

  it('drops an empty "Full size" value so no size key is persisted', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'video',
      size: '',
    });
    expect(result).not.toHaveProperty('size');
    expect(result).toEqual({ id: '1', content: 'asset-1', type: 'asset' });
  });

  it.each(['small', 'HUGE', 'medium '])(
    'drops a size (%j) outside the schema enum',
    (size: string) => {
      const result = normalizeType({
        id: '1',
        content: 'asset-1',
        type: 'image',
        size,
      });
      expect(result).not.toHaveProperty('size');
    },
  );

  it('drops a non-string size value', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'image',
      size: 2,
    });
    expect(result).not.toHaveProperty('size');
  });
});

// The item editor holds one content draft per concrete type and hands the
// whole set to `normalizeType` at save. Both saved item schemas are strict
// objects, so a surviving draft key does not merely bloat the row — it makes
// the protocol invalid. And the row being edited still carries the content it
// was opened with, so the row's own `content` is NOT the authority: promoting
// the active type's draft over it is what stops an image asset's id being
// saved as the text a participant reads (#1393).
describe('normalizeType with per-type content drafts', () => {
  const ALL_SLOTS = {
    contentText: 'Prose the researcher wrote',
    contentImage: 'asset-image-1',
    contentAudio: 'asset-audio-1',
    contentVideo: 'asset-video-1',
  };

  it.each([
    ['text', 'Prose the researcher wrote'],
    ['image', 'asset-image-1'],
    ['audio', 'asset-audio-1'],
    ['video', 'asset-video-1'],
  ])(
    'saves the %s draft as content and drops every other draft',
    (type: string, expected: string) => {
      const result = normalizeType({
        id: '1',
        // What the row was BEFORE this edit — a different type's content.
        content: 'stale-content-from-the-previous-type',
        type,
        ...ALL_SLOTS,
      });

      expect(result.content).toBe(expected);
      for (const slotName of Object.values(CONTENT_SLOT_NAMES)) {
        expect(result).not.toHaveProperty(slotName);
      }
    },
  );

  it('never saves an asset id as the content of a text item', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-image-1',
      type: 'text',
      contentText: 'What the researcher actually typed',
      contentImage: 'asset-image-1',
    });

    expect(result).toEqual({
      id: '1',
      content: 'What the researcher actually typed',
      type: 'text',
    });
  });

  it('clears content when the active draft is present but empty', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-image-1',
      type: 'text',
      contentText: undefined,
    });

    expect(result).not.toHaveProperty('content');
    expect(result).not.toHaveProperty('contentText');
  });

  it('leaves content alone for a row that carries no drafts at all', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'image',
    });
    expect(result).toEqual({ id: '1', content: 'asset-1', type: 'asset' });
  });

  // `denormalizeType` returns the schema's ambiguous 'asset' when a reference
  // cannot be resolved in the manifest. No draft belongs to it, and any draft
  // that reached the row anyway must not be promoted into `content`.
  it('drops drafts without promoting one for the unresolved "asset" type', () => {
    const result = normalizeType({
      id: '1',
      content: 'missing-asset',
      type: 'asset',
      contentText: 'A draft that belongs to no saved type',
    });

    expect(result).toEqual({
      id: '1',
      content: 'missing-asset',
      type: 'asset',
    });
  });
});

// The item editor is SHARED: the Information stage's ContentGrid and the
// FamilyPedigree intro screen mount the same `ItemEditor` and normalize with
// the same `normalizeType`. The issue was filed against Information only, but
// the intro screen had it too — so both saved schemas are asserted here, and
// both are `z.strictObject`s that reject a leftover draft key outright.
describe('normalized items satisfy the real saved schemas', () => {
  const editedRow = {
    id: 'item-1',
    // The row still carries what it was opened as: an image asset.
    content: 'asset-image-1',
    size: 'MEDIUM',
    type: 'text',
    contentText: 'What the researcher actually typed',
    contentImage: 'asset-image-1',
    contentAudio: 'asset-audio-1',
    contentVideo: 'asset-video-1',
  };

  it('produces an Information stage the schema accepts', () => {
    const parsed = informationStage.safeParse({
      id: 'stage-1',
      type: 'Information',
      label: 'About This Study',
      title: 'Welcome',
      items: [normalizeType(editedRow)],
    });

    expect(parsed.success).toBe(true);
  });

  it('produces a FamilyPedigree intro screen the schema accepts', () => {
    const parsed = familyPedigreeStage
      .pick({ introScreen: true })
      .safeParse({ introScreen: { items: [normalizeType(editedRow)] } });

    expect(parsed.success).toBe(true);
  });
});

describe('isContentSlotType', () => {
  it.each(['text', 'image', 'audio', 'video'])(
    'accepts the concrete type %s',
    (type: string) => {
      expect(isContentSlotType(type)).toBe(true);
    },
  );

  it.each(['asset', '', 'toString', 'constructor', undefined, null, 1])(
    'rejects %j, which names no content input',
    (type: unknown) => {
      expect(isContentSlotType(type)).toBe(false);
    },
  );
});

/**
 * `denormalizeType` is unchanged by this fix; these pin the contract the item
 * editor's missing-resource notice reads. It tells "the resource is gone" from
 * "the resource is the wrong kind of file" by asking whether the type it was
 * handed is one the manifest can hold, which is only meaningful because
 * `denormalizeType` substitutes the manifest entry's own type on a hit and
 * leaves the item's saved discriminant on a miss.
 */
describe('denormalizeType resolves a reference against the manifest', () => {
  const denormalize = (
    assetManifest: Record<string, unknown>,
    item: Record<string, unknown>,
  ) =>
    denormalizeType(
      {
        activeProtocol: { present: { assetManifest } },
      } as unknown as RootState,
      { item, index: 0 },
    );

  it('reports the resource type for a reference that resolves', () => {
    const result = denormalize(
      { 'asset-1': { id: 'asset-1', type: 'image', name: 'photo.png' } },
      { id: '1', type: 'asset', content: 'asset-1' },
    );

    expect(result?.type).toBe('image');
  });

  // The reachable case the notice's second branch exists for: a resource that
  // is present, and is not a medium a content item can show.
  it('reports a non-media resource type rather than the saved discriminant', () => {
    const result = denormalize(
      { 'asset-2': { id: 'asset-2', type: 'network', name: 'people.csv' } },
      { id: '1', type: 'asset', content: 'asset-2' },
    );

    expect(result?.type).toBe('network');
    expect(isManifestAssetType(result?.type)).toBe(true);
  });

  it('leaves the saved discriminant in place when nothing resolves', () => {
    const result = denormalize(
      { 'asset-1': { id: 'asset-1', type: 'image', name: 'photo.png' } },
      { id: '1', type: 'asset', content: 'deleted-asset' },
    );

    expect(result?.type).toBe('asset');
    expect(isManifestAssetType(result?.type)).toBe(false);
  });
});

describe('isManifestAssetType', () => {
  it.each(['image', 'audio', 'video', 'network', 'geojson', 'apikey'])(
    'accepts %s, a type the manifest can hold',
    (type: string) => {
      expect(isManifestAssetType(type)).toBe(true);
    },
  );

  // 'asset' is the item's own saved discriminant, which is exactly what
  // survives a manifest lookup that finds nothing.
  it.each(['asset', 'text', '', 'toString', undefined, null, 1])(
    'rejects %j, which no manifest entry can be',
    (type: unknown) => {
      expect(isManifestAssetType(type)).toBe(false);
    },
  );
});
