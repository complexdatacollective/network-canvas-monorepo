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
 */
export const normalizeType = (item: Item): Item => ({
  ...item,
  type: item.type === 'text' ? 'text' : 'asset',
});

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
