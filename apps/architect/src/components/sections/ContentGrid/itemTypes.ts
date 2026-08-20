import { get } from 'es-toolkit/compat';

import type { AssetType } from '~/ducks/modules/protocol/assetManifest';
import type { RootState } from '~/ducks/modules/root';
import { getAssetManifest } from '~/selectors/protocol';

import { sizeOptions } from './options';

type Item = {
  type: string;
  content?: string;
  [key: string]: unknown;
};

// Schema-valid display sizes: the size control's options minus the empty
// "Full size" sentinel. Used as a whitelist so normalizeType never persists a
// size outside the schema enum, even from legacy or hand-edited data.
const VALID_SIZES = new Set(
  sizeOptions.map(({ value }) => value).filter(Boolean),
);

// Concrete types that never carry a display size. Text has no size field in the
// schema; audio has no visual height to constrain. image/video keep a valid
// size, as does the ambiguous 'asset' fallback denormalizeType returns when an
// asset reference can't be resolved (so an image's size survives a broken ref).
const NON_SIZEABLE_TYPES = new Set(['text', 'audio']);

/**
 * The editor field each concrete content type keeps its draft in.
 *
 * The saved item has ONE `content` key whose meaning depends on `type` — prose
 * for text, an asset id otherwise. Editing it through a single field meant a
 * type change had to destroy it, and until it was destroyed the incoming
 * input was showing the outgoing type's value: an asset id sitting in the rich
 * text editor, one save away from becoming what a participant reads.
 *
 * So the editor gives each type its own field instead. Only the chosen type's
 * field is mounted, the others are parked in the form store's dormant values,
 * and `normalizeType` collapses the active one back into `content` at save.
 * Nothing is destroyed while the dialog is open, switching back restores the
 * draft verbatim, and no value can reach an input that cannot mean it. Four
 * slots rather than two: an image id is not a valid audio or video id either.
 *
 * Flat names, not `content.text` paths: `DialogArrayField`'s dormant merge
 * writes each entry with lodash-style `set`, which reads a dot as a path and
 * would replace the committed `content` STRING with an object.
 */
export const CONTENT_SLOT_NAMES = {
  text: 'contentText',
  image: 'contentImage',
  audio: 'contentAudio',
  video: 'contentVideo',
} as const;

export type ContentSlotType = keyof typeof CONTENT_SLOT_NAMES;

/**
 * Whether a type has a content input of its own. `denormalizeType` also
 * returns the schema's ambiguous `'asset'` when a reference cannot be resolved
 * in the manifest, and an item can be mid-edit with no type chosen at all;
 * neither names an input, so neither may be given one.
 */
export const isContentSlotType = (type: unknown): type is ContentSlotType =>
  typeof type === 'string' && Object.hasOwn(CONTENT_SLOT_NAMES, type);

/**
 * Every type the asset manifest can hold, written as a total mapping of
 * `AssetType` so a new kind of resource cannot be added to Architect without
 * deciding what a content item says about one.
 *
 * `denormalizeType` substitutes the manifest entry's own type whenever a
 * reference resolves and leaves the item's saved `'asset'` discriminant in
 * place when it does not. So for an item that has no content input of its own,
 * this predicate is the answer to "is the resource it names still here?" — a
 * resolved `network`, `geojson` or `apikey` resource is present and simply not
 * something a content item can present, which is a different problem for the
 * researcher than a reference to a resource that is gone.
 */
const MANIFEST_ASSET_TYPES: Record<AssetType, true> = {
  image: true,
  audio: true,
  video: true,
  network: true,
  geojson: true,
  apikey: true,
};

export const isManifestAssetType = (type: unknown): type is AssetType =>
  typeof type === 'string' && Object.hasOwn(MANIFEST_ASSET_TYPES, type);

/**
 * Content-item type mapping shared by the Information stage editor
 * (ContentGrid) and the FamilyPedigree intro screen editor. Editing works with
 * the concrete asset type (image/video/audio) so the right input is shown; the
 * saved item collapses back to the schema's text/asset discriminant.
 *
 * `size` is an image/video-only treatment. We keep `size` only for sizeable
 * types and only when it is a schema-valid enum value, dropping the key
 * otherwise (text/audio, an unset "Full size", or any invalid value) so the
 * saved item stays valid against the strict schema.
 */
export const normalizeType = (item: Item): Item => {
  const { size, ...rest } = item as Item & { size?: unknown };
  const type = item.type === 'text' ? 'text' : 'asset';
  const collapsed: Item = { ...rest, type };

  // Every per-type draft is editor session state. Both saved item schemas are
  // strict objects, so a surviving slot key is not a stray extra — it makes
  // the protocol invalid. Strip them all, by the slot list rather than by the
  // active type, so no unsaved draft can ride along.
  for (const slotName of Object.values(CONTENT_SLOT_NAMES)) {
    delete collapsed[slotName];
  }

  // The chosen type's slot is the only authority on `content`. The row still
  // carries the content it was opened with, so promoting the slot — rather
  // than leaving that value in place — is what stops an asset id being saved
  // as the text a participant reads. A slot that is present but empty clears
  // `content`; a slot that is absent means this row never went through the
  // item editor (normalizing already-saved data), so `content` stands.
  const activeSlot = isContentSlotType(item.type)
    ? CONTENT_SLOT_NAMES[item.type]
    : undefined;
  if (activeSlot !== undefined && Object.hasOwn(item, activeSlot)) {
    const slotValue = item[activeSlot];
    if (typeof slotValue === 'string') {
      collapsed.content = slotValue;
    } else {
      delete collapsed.content;
    }
  }

  if (
    NON_SIZEABLE_TYPES.has(item.type) ||
    typeof size !== 'string' ||
    !VALID_SIZES.has(size)
  ) {
    return collapsed;
  }

  return { ...collapsed, size };
};

export const denormalizeType = (
  state: RootState,
  { item }: { item: Record<string, unknown>; index: number },
): Item | null => {
  if (!item) {
    return null;
  }
  const typedItem = item as Item;

  if (typedItem.type === 'text') {
    return typedItem;
  }

  const assetManifest = getAssetManifest(state);
  const manifestType = get(assetManifest, [typedItem.content ?? '', 'type']) as
    | string
    | undefined;

  // Fall back to the persisted discriminant when the asset can't be resolved
  // (no content selected yet, or a stale/deleted reference), so callers never
  // receive `type: undefined`.
  return {
    ...typedItem,
    type: manifestType ?? typedItem.type,
  };
};
