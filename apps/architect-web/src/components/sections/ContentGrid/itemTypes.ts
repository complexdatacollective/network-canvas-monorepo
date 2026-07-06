import { get } from 'es-toolkit/compat';
import { formValueSelector } from 'redux-form';

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

  if (
    NON_SIZEABLE_TYPES.has(item.type) ||
    typeof size !== 'string' ||
    !VALID_SIZES.has(size)
  ) {
    return { ...rest, type };
  }

  return { ...rest, type, size };
};

export const denormalizeType = (
  state: RootState,
  { form, editField }: { form: string; editField: string },
): Item | null => {
  const item = formValueSelector(form)(state, editField) as Item | undefined;

  if (!item) {
    return null;
  }

  if (item.type === 'text') {
    return item;
  }

  const assetManifest = getAssetManifest(state);
  const manifestType = get(assetManifest, [item.content ?? '', 'type']) as
    | string
    | undefined;

  // Fall back to the persisted discriminant when the asset can't be resolved
  // (no content selected yet, or a stale/deleted reference), so callers never
  // receive `type: undefined`.
  return {
    ...item,
    type: manifestType ?? item.type,
  };
};
