import { omit } from 'es-toolkit/compat';

import {
  collectEntityAttributeReferences,
  type VariablePropertyKey,
} from '@codaco/protocol-validation';

import type {
  ResolvedFormValidationView,
  VariableOverlay,
} from '../../Validations/contradictions';

// Codebook props that, for NetworkComposer, stay on the codebook variable.
// `component`/`parameters` are intentionally NOT here — they live on the field.
export const COMPOSER_CODEBOOK_PROPERTIES = [
  'options',
  'validation',
] as const satisfies readonly VariablePropertyKey[];

export const composerNormalizeField = (field: Record<string, unknown>) => {
  // Keep `id` so the list item retains a stable, unique React key.
  // `_contradiction` is the editor's error-only field (see
  // ComposerAttributeFields): it is registered so a form-level message has
  // somewhere to land, and so it reports a value the row must never keep.
  const normalized = omit(field, [
    '_createNewVariable',
    '_contradiction',
    ...COMPOSER_CODEBOOK_PROPERTIES,
  ]);
  // An empty label saves as '' and defeats the variable-name caption fallback,
  // so treat a blank label as absent.
  if (typeof normalized.label === 'string' && normalized.label.trim() === '') {
    return omit(normalized, ['label']);
  }
  return normalized;
};

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

const composerFormFieldVariables = (form: unknown): string[] => {
  if (!isRecord(form) || !Array.isArray(form.fields)) return [];
  return form.fields
    .filter(isRecord)
    .map((field) => field.variable)
    .filter(
      (variable): variable is string =>
        typeof variable === 'string' && variable !== '',
    );
};

/**
 * Shared FormFieldSchema fields have no rendering override: their resolved
 * view is the codebook controls themselves. The active dialog row is included
 * dynamically because it is not added to this array until save.
 */
export const sharedFormValidationView = (
  fields: unknown,
): ResolvedFormValidationView => ({
  renderedVariableIds: new Set(
    composerFormFieldVariables({ fields: Array.isArray(fields) ? fields : [] }),
  ),
  overlay: {},
  includesEditedVariable: true,
});

/**
 * Every committed shared FormFieldSchema view for `subject`. The schema's
 * writer metadata identifies these surfaces without duplicating its stage-type
 * union here; FamilyPedigree is the sole surface whose subject must be
 * recovered from nodeConfig rather than the reference hit.
 */
export const sharedFormValidationViews = (
  stages: unknown,
  subject: { entity: 'node' | 'edge'; type: string | null },
): ResolvedFormValidationView[] => {
  if (!Array.isArray(stages) || subject.type === null) return [];

  const variablesByStage = new Map<number, Set<string>>();
  for (const hit of collectEntityAttributeReferences({ stages })) {
    if (
      hit.usage !== 'validatedAttribute' ||
      hit.path.at(-1) !== 'variable' ||
      hit.path[0] !== 'stages' ||
      typeof hit.path[1] !== 'number'
    ) {
      continue;
    }

    const stageIndex = hit.path[1];
    const stage = stages[stageIndex];
    if (!isRecord(stage) || stage.type === 'NetworkComposer') continue;

    const hitSubject =
      hit.subject ??
      (stage.type === 'FamilyPedigree' &&
      isRecord(stage.nodeConfig) &&
      typeof stage.nodeConfig.type === 'string'
        ? { entity: 'node' as const, type: stage.nodeConfig.type }
        : undefined);
    if (
      hitSubject?.entity !== subject.entity ||
      hitSubject.type !== subject.type
    ) {
      continue;
    }

    const variables = variablesByStage.get(stageIndex) ?? new Set<string>();
    variables.add(hit.variableId);
    variablesByStage.set(stageIndex, variables);
  }

  return [...variablesByStage.values()].map((renderedVariableIds) => ({
    renderedVariableIds,
    overlay: {},
  }));
};

/**
 * Every distinct NetworkComposer form that resolves `subject`'s field
 * controls. A codebook variable edit must be checked against each view rather
 * than a merged overlay, because later stages may intentionally choose a
 * different component or parameter set for the same variable.
 */
export const composerValidationViews = (
  stages: unknown,
  subject: { entity: 'node' | 'edge'; type: string | null },
  excludeStageId?: string,
): ResolvedFormValidationView[] => {
  const views: ResolvedFormValidationView[] = [];
  if (!Array.isArray(stages) || subject.type === null) return views;

  const addView = (form: unknown): void => {
    const renderedVariableIds = new Set(composerFormFieldVariables(form));
    if (renderedVariableIds.size === 0 || !isRecord(form)) return;
    views.push({
      renderedVariableIds,
      overlay: buildComposerFieldOverlay(form.fields),
    });
  };

  for (const stage of stages) {
    if (!isRecord(stage) || stage.type !== 'NetworkComposer') continue;
    if (excludeStageId !== undefined && stage.id === excludeStageId) continue;
    if (subject.entity === 'node') {
      const stageSubject = stage.subject;
      if (
        isRecord(stageSubject) &&
        stageSubject.entity === 'node' &&
        stageSubject.type === subject.type
      ) {
        addView(stage.nodeForm);
      }
      continue;
    }
    if (!Array.isArray(stage.edges)) continue;
    for (const edge of stage.edges) {
      if (!isRecord(edge)) continue;
      const edgeSubject = edge.subject;
      if (
        isRecord(edgeSubject) &&
        edgeSubject.entity === 'edge' &&
        edgeSubject.type === subject.type
      ) {
        addView(edge.form);
      }
    }
  }
  return views;
};

/**
 * Thirty-fifth-wave finding: the ids of `subject`'s variables that a
 * NetworkComposer form in some OTHER stage renders with its own control —
 * the editor-side counterpart of schema.ts's `collectComposerFieldOverrides`
 * + `unknownRenderingFor` (twentieth-wave Finding 3). The composer attribute
 * editor's prospective view is a PER-FORM view: a variable this form does
 * not write, but another composer form overrides, renders at that other
 * form's control, so reading it through its unused codebook default invents
 * cross-form mismatches — two codebook-full datetimes joined by `sameAs`,
 * each rendered as a year picker by a different stage, falsely blocked the
 * save of either field. `makeFieldEditorValidate` drops these variables from
 * its checked set unless the current form itself determines their rendering
 * (a sibling overlay entry, or the edited draft's own variable).
 *
 * `excludeStageId` is the stage being edited: its committed copy in the
 * protocol is superseded wholesale by the stage draft, whose fields the
 * caller already accounts for. Within one NetworkComposer stage no two forms
 * share a subject (nodeForm's subject is a node type; edge types are unique
 * per stage), so the draft's OTHER forms can never contribute here.
 * `stages` is `unknown` in keeping with this module's defensive reads of
 * redux state (`buildComposerFieldOverlay` treats `fields` the same way).
 */
export const crossFormRenderedVariables = (
  stages: unknown,
  subject: { entity: 'node' | 'edge'; type: string | null },
  excludeStageId?: string,
): ReadonlySet<string> => {
  const rendered = new Set<string>();
  for (const view of composerValidationViews(stages, subject, excludeStageId)) {
    for (const variable of view.renderedVariableIds) {
      rendered.add(variable);
    }
  }
  return rendered;
};

/**
 * The live draft values for the composer attribute editor, with the same null
 * reset read as inheritance. Feeds `makeFieldEditorValidate`, whose
 * `buildProspectiveVariables` layers `component`/`options`/`parameters` over
 * the codebook variable only when they are not `undefined`.
 *
 * Audit sweep: `options` belongs in that list too. `handleChangeComponent`
 * nulls it whenever a boolean row switches between Toggle and Boolean (see
 * withFieldsHandlers), and for a composer field `options` stays on the
 * CODEBOOK variable — `COMPOSER_CODEBOOK_PROPERTIES` above keeps it there, and
 * the stage commit prunes the null away. Passing the raw null through
 * installed it OVER the codebook list, so `booleanDomain` fell back to the
 * unrestricted {true, false} and the editor missed a contradiction the real
 * options create.
 */
export const composerDraftValues = (
  values: Record<string, unknown>,
): Record<string, unknown> => ({
  ...values,
  component: inheritWhenNull(values.component),
  options: inheritWhenNull(values.options),
  parameters: inheritWhenNull(values.parameters),
});

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
