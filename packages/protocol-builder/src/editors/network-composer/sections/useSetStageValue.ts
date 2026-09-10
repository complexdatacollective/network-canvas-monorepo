import { useCallback } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/store/types';

import { useStageEditorForm } from '../../../form/stageEditorContext.ts';

/**
 * Writes one value into the stage form from outside a field.
 *
 * For the two things a composer does that no control on the stage form is the
 * author of: binding a slot to an attribute a codebook editor has just
 * created, and writing a connection type's form back into the one value that
 * holds every connection entry.
 *
 * Addressed through the STAGE form's own store rather than the nearest one, so
 * it still writes the stage while a dialog with a form of its own is open.
 */
export function useSetStageValue(): (path: string, value: FieldValue) => void {
  const { storeApi } = useStageEditorForm();
  return useCallback(
    (path, value) => {
      storeApi.getState().setFieldValue(path, value);
    },
    [storeApi],
  );
}
