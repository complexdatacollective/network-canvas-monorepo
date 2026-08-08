import { get } from 'es-toolkit/compat';
import { useCallback, useMemo, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import ComposerAttributeFields, {
  COMPOSER_CONTRADICTION_FIELD,
} from '~/components/EditableAttributesList/ComposerAttributeFields';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ComposerFieldPreview from '~/components/sections/Form/ComposerFieldPreview';
import {
  buildComposerFieldOverlay,
  COMPOSER_CODEBOOK_PROPERTIES,
  composerDraftValues,
  composerNormalizeField,
  composerValidationViews,
  crossFormRenderedVariables,
  isVariableUsedBySibling,
  sharedFormValidationViews,
} from '~/components/sections/Form/composerHelpers';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
import { useStageFormValues } from '~/components/StageEditor/useStageFormValues';
import { makeFieldEditorValidate } from '~/components/Validations/contradictions';
import type { RootState } from '~/ducks/modules/root';
import {
  getVariablesForSubject,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';

import DialogArrayField, {
  type DialogArrayItemSelector,
} from './DialogArrayField';

/** Stable empty array: `initialValue` is a register-effect dependency. */
const NO_FIELDS: Record<string, unknown>[] = [];

// DialogArrayField renders these with the edited row's own properties, so it
// types them by the only shape it can know.
const EditorFields = ComposerAttributeFields as ComponentType<
  Record<string, unknown>
>;
const Preview = ComposerFieldPreview as ComponentType<Record<string, unknown>>;

/**
 * The dialog opens on the field merged with its codebook variable's
 * `options`/`validation`, which the composer keeps on the variable rather than
 * the field. The row arrives directly, because the array is one opaque field
 * value.
 */
const composerItemSelector =
  (entity: 'node' | 'edge', type: string | null): DialogArrayItemSelector =>
  (state: RootState, { item }) => {
    const variable = item.variable as string | undefined;
    const codebookVariables = getVariablesForSubject(state, {
      entity,
      type: type ?? undefined,
    });
    const codebookVariable = get(
      codebookVariables,
      variable ?? '',
      {},
    ) as Record<string, unknown>;

    // Merge ONLY options + validation so the dialog can edit them; component +
    // parameters stay as the field already has them (do not let codebook
    // clobber).
    const merged: Record<string, unknown> = { ...item };
    for (const key of COMPOSER_CODEBOOK_PROPERTIES) {
      if (key in codebookVariable) merged[key] = codebookVariable[key];
    }
    return merged;
  };

type EditableAttributesListProps = {
  /** Path of the array in the stage form (`nodeForm.fields`, `edges[0].form.fields`). */
  fieldName: string;
  entity: 'node' | 'edge';
  type: string | null;
  /** DOM id of the row editor's form. */
  editFormName?: string;
  title?: string;
  /**
   * Accessible name for the list. The surrounding Subsection carries the
   * visible heading, so this is hidden by default (see plan §2.10).
   */
  label?: string;
  handleChangeFields: (field: Record<string, unknown>) => unknown;
  siblingUnvalidatedVariableIds?: string[];
};

/**
 * A dialog-edited list of an entity's editable attributes.
 *
 * Cross-form reads go through `useStageFormValues`, which reads the stage
 * form's store directly — including from inside a row dialog, whose own
 * `FormStoreProvider` shadows `useFormValue` but deliberately not the stage
 * form context.
 */
const EditableAttributesList = ({
  fieldName,
  entity,
  type,
  editFormName = 'editable-list-form',
  title = 'Edit attribute',
  label = 'Editable attributes',
  handleChangeFields,
  siblingUnvalidatedVariableIds,
}: EditableAttributesListProps) => {
  // Memoized on the primitives so the subject object identity is stable
  // across renders, matching getVariablesForSubjectSelector's reselect
  // memoization instead of defeating it every render.
  const subject = useMemo(
    () => ({ entity, type: type ?? undefined }),
    [entity, type],
  );
  const allVariables = useSelector((state: RootState) =>
    getVariablesForSubjectSelector(state, subject),
  );

  // `useStageFormValues` caches per paths array identity, so it must be stable.
  const stagePaths = useMemo(() => [fieldName] as const, [fieldName]);
  // This stage's OTHER composer fields (nodeForm.fields, or one edge type's
  // edges[i].form.fields) each carry their own component/parameters,
  // independent of the codebook variable — a contradiction check for a fresh
  // draft in this dialog must see how its siblings actually render in THIS
  // stage, not just the codebook definition. Read live from the stage form,
  // which the row dialog's own form store deliberately does not shadow.
  const composerFields = useStageFormValues(stagePaths)[fieldName];

  const { committedStage, stageId } = useStageFormContext();
  // Per-Field `initialValue`: the form store has no whole-form initial values.
  const initialValue = useMemo(() => {
    const committed: unknown = get(committedStage, fieldName);
    return Array.isArray(committed)
      ? (committed as Record<string, unknown>[])
      : NO_FIELDS;
  }, [committedStage, fieldName]);

  const roleMap = useSelector(getVariableRoleMap);
  // Backs makeFieldEditorValidate's save-time gate: a composer attribute may
  // not pick a variable some bin/highlight/census/etc. elsewhere already
  // writes.
  const hasUnvalidatedUse = useCallback(
    (variableId: string) =>
      (roleMap[roleMapKey(subject, variableId)]?.unvalidated ?? 0) > 0 ||
      (siblingUnvalidatedVariableIds?.includes(variableId) ?? false),
    [roleMap, subject, siblingUnvalidatedVariableIds],
  );
  // This subject's variables that a composer form in some OTHER stage renders
  // with its own control. The stage being edited is excluded by its own id —
  // its committed copy in the protocol is superseded wholesale by the draft
  // `composerFields` already reflects. A new stage has no id yet, and no
  // committed copy to exclude either.
  const committedStages = useSelector(
    (state: RootState) => getProtocol(state)?.stages,
  );
  // The stage's own id comes from the editor's identity rather than a form
  // value: `getFormValues()` reports registered fields only, and no field
  // registers `id`.
  const excludeStageId = stageId ?? undefined;
  const crossFormRendered = useMemo(
    () =>
      crossFormRenderedVariables(
        committedStages,
        { entity, type },
        excludeStageId,
      ),
    [committedStages, entity, excludeStageId, type],
  );
  const resolvedComposerViews = useMemo(
    () =>
      composerValidationViews(
        committedStages,
        { entity, type },
        excludeStageId,
      ),
    [committedStages, entity, excludeStageId, type],
  );
  const resolvedSharedViews = useMemo(
    () => sharedFormValidationViews(committedStages, { entity, type }),
    [committedStages, entity, type],
  );
  // The overlay is built per validate call so the edited row itself —
  // identified by the array index DialogArrayField surfaces as `editIndex` —
  // can be excluded at construction time. Excluding by index (rather than by
  // the field's `id`, which imported protocols may omit) keeps the edited
  // field's stale pre-draft override out of the checked set even across a
  // reassignment to a different variable.
  const editorValidate = useMemo(
    () =>
      (
        values: Record<string, unknown>,
        props?: { editIndex?: number; initialValues?: unknown },
      ): Record<string, unknown> => {
        const variable =
          typeof values.variable === 'string' ? values.variable : '';
        // The overlay below is keyed by variable, so a draft that duplicates a
        // sibling's variable just replaces that sibling's entry and looks
        // coherent — while ComposerFormSchema rejects the saved stage
        // outright. Gate the duplicate here, ahead of the contradiction check,
        // using the same committed sibling list the overlay is built from.
        if (
          isVariableUsedBySibling(composerFields, variable, props?.editIndex)
        ) {
          return {
            variable:
              'This variable is already collected by another attribute in this list. Choose a different variable, or edit the existing attribute instead.',
          };
        }
        // `makeFieldEditorValidate` keys its messages at `validation`, which
        // the FieldFields editor renders as a Validations field — but this
        // editor has none, so the error would be inert. Re-key it onto the
        // editor's own always-rendered contradiction field, which both blocks
        // the save and shows the researcher why.
        const { validation, ...rest } = makeFieldEditorValidate(
          allVariables,
          buildComposerFieldOverlay(composerFields, props?.editIndex),
          crossFormRendered,
          hasUnvalidatedUse,
          [...resolvedSharedViews, ...resolvedComposerViews],
          'current-form',
        )(composerDraftValues(values), props);
        return typeof validation === 'string'
          ? { ...rest, [COMPOSER_CONTRADICTION_FIELD]: validation }
          : rest;
      },
    [
      allVariables,
      composerFields,
      crossFormRendered,
      hasUnvalidatedUse,
      resolvedComposerViews,
      resolvedSharedViews,
    ],
  );

  const itemSelector = useMemo(
    () => composerItemSelector(entity, type),
    [entity, type],
  );
  const editorProps = useMemo(
    () => ({ type, entity, composerFields }),
    [composerFields, entity, type],
  );
  const previewProps = useMemo(() => ({ entity, type }), [entity, type]);

  return (
    <ArchitectArrayField
      name={fieldName}
      label={label}
      labelHidden
      component={DialogArrayField}
      initialValue={initialValue}
      // Editable attributes are optional (no node/edge attributes is valid).
      validation={{}}
      addTitle={title}
      editorTitle={title}
      editorFieldsComponent={EditorFields}
      // The editor's variable picker takes the same committed sibling list
      // `editorValidate` gates on, so a variable another attribute already
      // collects is never offered in the first place rather than being offered
      // and then rejected on save.
      editorProps={editorProps}
      editorValidate={editorValidate}
      itemLabel="attribute"
      itemSelector={itemSelector}
      normalizeItem={(value: unknown) =>
        composerNormalizeField(value as Record<string, unknown>)
      }
      onBeforeSave={(value: unknown) =>
        handleChangeFields(value as Record<string, unknown>)
      }
      previewComponent={Preview}
      previewProps={previewProps}
      requestedEditFormName={editFormName}
      sortable
    />
  );
};

export default EditableAttributesList;
