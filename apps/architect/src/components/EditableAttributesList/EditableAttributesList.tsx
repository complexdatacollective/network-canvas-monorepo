import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';

import ComposerFieldPreview from '../sections/Form/ComposerFieldPreview';
import {
  buildComposerFieldOverlay,
  composerDraftValues,
  composerItemSelector,
  composerNormalizeField,
  composerValidationViews,
  crossFormRenderedVariables,
  isVariableUsedBySibling,
  sharedFormValidationViews,
} from '../sections/Form/composerHelpers';
import { makeFieldEditorValidate } from '../Validations/contradictions';
import ComposerAttributeFields, {
  COMPOSER_CONTRADICTION_FIELD,
} from './ComposerAttributeFields';

type EditableAttributesListProps = {
  fieldName: string;
  entity: 'node' | 'edge';
  type: string | null;
  form: string;
  editFormName?: string;
  title?: string;
  handleChangeFields: (field: Record<string, unknown>) => unknown;
  siblingUnvalidatedVariableIds?: string[];
};

const EditableAttributesList = ({
  fieldName,
  entity,
  type,
  form,
  editFormName = 'editable-list-form',
  title = 'Edit attribute',
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
  // This stage's OTHER committed composer fields (nodeForm.fields, or one
  // edge type's edges[i].form.fields) each carry their own component/
  // parameters, independent of the codebook variable — a contradiction check
  // for a fresh draft in this dialog must see how its siblings actually
  // render in THIS stage, not just the codebook definition.
  const composerFields = useSelector((state: RootState) =>
    formValueSelector(form)(state, fieldName),
  );
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
  // Thirty-fifth-wave finding: this subject's variables that a composer form
  // in some OTHER stage renders with its own control. The stage being edited
  // is excluded by the id its draft carries (`initialValues = stage` in
  // StageEditor) — its committed copy in the protocol is superseded wholesale
  // by the redux-form draft `composerFields` already reflects. A new stage's
  // draft has no id yet, and has no committed copy to exclude either.
  const committedStages = useSelector(
    (state: RootState) => getProtocol(state)?.stages,
  );
  const draftStageId = useSelector((state: RootState): unknown =>
    formValueSelector(form)(state, 'id'),
  );
  const crossFormRendered = useMemo(
    () =>
      crossFormRenderedVariables(
        committedStages,
        { entity, type },
        typeof draftStageId === 'string' ? draftStageId : undefined,
      ),
    [committedStages, entity, type, draftStageId],
  );
  const resolvedComposerViews = useMemo(
    () =>
      composerValidationViews(
        committedStages,
        { entity, type },
        typeof draftStageId === 'string' ? draftStageId : undefined,
      ),
    [committedStages, entity, type, draftStageId],
  );
  const resolvedSharedViews = useMemo(
    () => sharedFormValidationViews(committedStages, { entity, type }),
    [committedStages, entity, type],
  );
  // Eleventh-wave Finding 4: the overlay is built per validate call so the
  // edited row itself — identified by the array index DialogArrayField
  // surfaces as validate's `editIndex` prop — can be excluded at
  // construction time. Excluding by index (rather than by the field's `id`,
  // which imported protocols may omit) keeps the edited field's stale
  // pre-draft override out of the checked set even across a reassignment to
  // a different variable.
  const editorValidate = useMemo(
    () =>
      (
        values: Record<string, unknown>,
        props?: { editIndex?: number; initialValues?: unknown },
      ): Record<string, unknown> => {
        const variable =
          typeof values.variable === 'string' ? values.variable : '';
        // Sixteenth-wave Finding 1: the overlay below is keyed by variable, so
        // a draft that duplicates a sibling's variable just replaces that
        // sibling's entry and looks coherent — while ComposerFormSchema
        // rejects the saved stage outright. Gate the duplicate here, ahead of
        // the contradiction check, using the same committed sibling list the
        // overlay is built from.
        if (
          isVariableUsedBySibling(composerFields, variable, props?.editIndex)
        ) {
          return {
            variable:
              'This variable is already collected by another attribute in this list. Choose a different variable, or edit the existing attribute instead.',
          };
        }
        // Eighteenth-wave Finding 2: `makeFieldEditorValidate` keys its
        // messages at `validation`, which the FieldFields editor renders as a
        // Validations field — but this editor has none, and redux-form only
        // fails a submit over errors on REGISTERED fields, so the error was
        // inert: the dialog saved and `onBeforeSave` wrote the contradictory
        // edit back to the codebook. Re-key it onto the editor's own
        // always-rendered contradiction field, which both blocks the save and
        // shows the researcher why.
        // Nineteenth-wave Finding 3: `composerDraftValues` reads the editor's
        // `component`/`parameters` null reset as inheritance, matching the
        // runtime's `fieldParameters ?? codebookParameters` — the overlay
        // builder does the same for the committed siblings.
        // Thirty-fifth-wave finding: `crossFormRendered` lets the validator
        // drop variables whose rendering another composer form owns, instead
        // of misreading their unused codebook defaults as this stage's
        // effective controls (see makeFieldEditorValidate's doc comment).
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

  return (
    <ValidatedFieldArray
      name={fieldName}
      component={DialogArrayField}
      // Editable attributes are optional (no node/edge attributes is valid).
      validation={{}}
      componentProps={{
        addTitle: title,
        editorFieldsComponent: ComposerAttributeFields,
        // Seventeenth-wave follow-up: the editor's variable picker takes the
        // same committed sibling list `editorValidate` gates on, so a variable
        // another attribute already collects is never offered in the first
        // place rather than being offered and then rejected on save.
        editorProps: { type, entity, composerFields },
        editorTitle: title,
        editorValidate,
        itemLabel: 'attribute',
        itemSelector: composerItemSelector(entity, type),
        normalizeItem: (value: unknown) =>
          composerNormalizeField(value as Record<string, unknown>),
        onBeforeSave: (value: unknown) =>
          handleChangeFields(value as Record<string, unknown>),
        previewComponent: ComposerFieldPreview,
        previewProps: { entity, type },
        requestedEditFormName: editFormName,
        sortable: true,
      }}
    />
  );
};

export default EditableAttributesList;
