import { get } from 'es-toolkit/compat';
import { formValueSelector } from 'redux-form';

import type { RootState } from '~/ducks/modules/root';
import { getAssetManifest } from '~/selectors/protocol';

type Item = {
  type: string;
  content?: string;
  [key: string]: unknown;
};

/**
 * Content-item type mapping shared by the Information stage editor
 * (ContentGrid) and the FamilyPedigree intro screen editor. Editing works with
 * the concrete asset type (image/video/audio) so the right input is shown; the
 * saved item collapses back to the schema's text/asset discriminant.
 *
 * `size` is an image/video-only treatment: text items have no size field in the
 * schema, and an unset ("Full size") size means no constraint. In both cases we
 * drop the key so the saved item stays valid against the strict item schema.
 */
export const normalizeType = (item: Item): Item => {
  const { size, ...rest } = item as Item & { size?: unknown };
  const type = item.type === 'text' ? 'text' : 'asset';

  if (type === 'text' || !size) {
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
