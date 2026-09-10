import type { VariableOverlay } from '../../Validations/contradictions';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Nineteenth-wave Finding 3: a composer field's `component`/`parameters` with
 * the editor's null reset read as ABSENT. Changing a field's input control
 * writes `parameters: null` and picking a componentless codebook variable
 * writes `component: null` (withFieldsHandlers' `handleChangeComponent` /
 * `handleChangeVariable`); the stage commit prunes those nulls away, and the
 * interview runtime resolves `fieldParameters ?? codebookParameters` (see
 * `@codaco/interview`'s form-field selector), so a null on the FIELD means
 * "inherit the codebook variable's". Passing the raw null through installed
 * it OVER the codebook value and read the field as a full-resolution
 * override, falsely rejecting e.g. a codebook year DatePicker switched back
 * from RelativeDatePicker beside a year-resolution `sameAs` sibling.
 *
 * This is composer-only on purpose. The codebook-variable editors
 * (`FieldFields`, `NodeConfiguration`) commit the same reset as a REPLACEMENT
 * of the variable's own parameters (`prune`d away by `updateVariableAsync`),
 * so there a null genuinely clears them and the prospective view must keep
 * reading it that way.
 */
const inheritWhenNull = (value: unknown): unknown => value ?? undefined;

/**
 * A stage's committed composer fields (`nodeForm.fields`, or one edge type's
 * `edges[i].form.fields`), reshaped into the
 * `makeFieldEditorValidate` overlay: each field's OWN `component`/
 * `parameters` — which for NetworkComposer live on the field, not the
 * codebook variable — keyed by the variable it renders. Fields with no
 * `variable` yet (a still-blank new row) are skipped; they render nothing
 * for any variable and so have no override to contribute.
 *
 * `excludeIndex` is the array position of the field currently being edited,
 * whose entry is its pre-draft committed value and must never shadow the
 * live draft values the editor validate layers on afterwards. Eleventh-wave
 * Finding 4: excluding here, by index, replaces the previous exclusion
 * inside `makeFieldEditorValidate` by the field's `id` — imported protocols
 * can carry id-less fields (ComposerFormFieldSchema.id is optional), which
 * escaped an id-keyed exclusion and left a stale override in the checked
 * set; the index identifies the row regardless, and survives the edit
 * reassigning the field to a different variable.
 */
export const buildComposerFieldOverlay = (
  fields: unknown,
  excludeIndex?: number,
): VariableOverlay => {
  if (!Array.isArray(fields)) return {};
  const overlay: VariableOverlay = {};
  for (const [index, field] of fields.entries()) {
    if (index === excludeIndex) continue;
    if (!isRecord(field)) continue;
    const { variable, component, parameters } = field;
    if (typeof variable !== 'string' || variable === '') continue;
    overlay[variable] = {
      component: inheritWhenNull(component),
      parameters: inheritWhenNull(parameters),
    };
  }
  return overlay;
};

/**
 * Sixteenth-wave Finding 1: whether a committed sibling field — any field
 * except the one at `excludeIndex`, the row being edited — already writes
 * `variable`. `ComposerFormSchema` rejects a form naming one variable twice
 * (thirteenth-wave Finding 1), but the overlay above cannot surface that: it
 * is keyed BY variable, so a duplicate draft merely replaces its sibling's
 * entry and the contradiction check sees a single, coherent field. Reads the
 * same `fields`/`excludeIndex` pair the overlay is built from, and matches on
 * the variable alone — a field's `id` is optional on
 * ComposerFormFieldSchema, so id-less imported fields count exactly like ones
 * Architect created.
 */
export const isVariableUsedBySibling = (
  fields: unknown,
  variable: string,
  excludeIndex?: number,
): boolean => {
  if (!Array.isArray(fields) || variable === '') return false;
  return fields.some(
    (field, index) =>
      index !== excludeIndex && isRecord(field) && field.variable === variable,
  );
};
