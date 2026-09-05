import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getStageEditorInitialValues } from '../../../interfaces/initialValues.ts';
import { getInterfaceTemplate } from '../../../interfaces/templates.ts';

/**
 * What a stage of this interface holds the moment a researcher creates it.
 *
 * Assembled from the package's own template and initial-values pair rather
 * than written out in each test, because that pair is the thing under test: a
 * test that hard-coded `{}` would go on passing after a template gained a
 * default the editor never showed.
 *
 * `type` is dropped because the session owns a stage's identity — it is passed
 * beside the fields, not inside them — and a stage document assembled with it
 * in both places would let a test pass that had lost track of which is which.
 */
export function newStageFields(interfaceType: StageType): SectionDoc {
  const { type: _type, ...fields } = getStageEditorInitialValues({
    interfaceType,
    template: getInterfaceTemplate(interfaceType),
  });
  return fields;
}
