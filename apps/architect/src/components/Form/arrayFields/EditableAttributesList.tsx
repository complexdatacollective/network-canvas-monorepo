import { get } from 'es-toolkit/compat';
import { useCallback, useMemo, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ComposerAttributeFields, {
  COMPOSER_CONTRADICTION_FIELD,
} from '~/components/EditableAttributesList/ComposerAttributeFields';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import IssueAnchor from '~/components/IssueAnchor';
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
import FieldEditorPreview from '~/components/sections/Form/FieldEditorPreview';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
import { useStageFormValues } from '~/components/StageEditor/useStageFormValues';
import { makeFieldEditorValidate } from '~/components/Validations/contradictions';
import type { RootState } from '~/ducks/modules/root';
import {
  getVariablesForSubject,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { getVariableRoleMap } from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';
import { hasUnvalidatedUse } from '~/selectors/roleFilters';

import DialogArrayField, {
  type DialogArrayItemSelector,
} from './DialogArrayField';
const defaultMessages = defineMessages({
  title: {
    id: 'architect.defaults.components.Form.arrayFields.EditableAttributesList.title',
    defaultMessage: 'Edit attribute',
    description:
      'Default researcher-facing copy when the caller does not supply its own title.',
  },
  label: {
    id: 'architect.defaults.components.Form.arrayFields.EditableAttributesList.label',
    defaultMessage: 'Editable attributes',
    description:
      'Default researcher-facing copy when the caller does not supply its own label.',
  },
});

/** Stable empty array: `initialValue` is a register-effect dependency. */
const NO_FIELDS: Record<string, unknown>[] = [];
const COMPOSER_PREVIEW_PROPS = { mode: 'composer' };

// DialogArrayField renders these with the edited row's own properties, so it
// types them by the only shape it can know.
const EditorFields = ComposerAttributeFields as ComponentType<
  Record<string, unknown>
>;
const EditorPreview = FieldEditorPreview as ComponentType<
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
   * Visible text and accessible name of the add button. REQUIRED, and not
   * defaultable: a Network Composer stage mounts one of these lists for its
   * node type and one more for EVERY selected edge type, so no constant
   * belonging to this component can tell them apart — only the caller knows
   * whose attributes its list holds.
   */
  addButtonLabel: string;
  /**
   * Accessible name for the list. The surrounding nested Section carries the
   * visible heading, so this is hidden by default (see plan §2.10).
   */
  label?: string;
  handleChangeFields: (field: Record<string, unknown>) => unknown;
  siblingUnvalidatedVariableIds?: string[];
  /**
   * Controlled mode. Supplying `onChange` makes the caller the owner of the
   * array: nothing is registered here, and every read and write goes through
   * these two props.
   *
   * Required wherever this list sits INSIDE another registered field's value,
   * which is `edges[N].form.fields` — `edges` is itself one registered array
   * field. Registering the leaf too would make `fieldName` positional over a
   * list the researcher can delete from: removing an edge type re-indexes the
   * survivors, and the removed block's unmount parks its value dormant under
   * the name the survivor is rebinding TO. `registerField` prefers a dormant
   * value over `initialValue`, so the survivor silently adopts the deleted
   * edge type's attributes. Deleting also snapshots a `getFormValues()` taken
   * before the leaves re-register, where the stale `edges[1].form.fields`
   * replays onto a one-element array and invents an `id`-less, `subject`-less
   * second edge the protocol schema rejects.
   *
   * `nodeForm.fields` and the plain Form's `form.fields` are fixed paths with
   * no container field above them, so they stay uncontrolled.
   */
  value?: Record<string, unknown>[];
  /** `undefined` is DialogArrayField's empty case; the owner picks the shape. */
  onChange?: (fields: Record<string, unknown>[] | undefined) => void;
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
  title: providedTitle,
  addButtonLabel,
  label: providedLabel,
  handleChangeFields,
  siblingUnvalidatedVariableIds,
  value,
  onChange,
}: EditableAttributesListProps) => {
  const intl = useAppIntl();
  const title = providedTitle ?? intl.formatMessage(defaultMessages.title);
  const label = providedLabel ?? intl.formatMessage(defaultMessages.label);

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
  //
  // A controlled list is not in the store under `fieldName` at all — its owner
  // holds it — so the prop is the live list there.
  const registeredFields = useStageFormValues(stagePaths)[fieldName];
  const composerFields = onChange ? value : registeredFields;

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
  const hasUnvalidatedUseForSubject = useCallback(
    (variableId: string) =>
      hasUnvalidatedUse(roleMap, subject, variableId) ||
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
            variable: createMessageError(
              arrayValidationMessages.duplicateAttribute,
            ),
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
          hasUnvalidatedUseForSubject,
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
      hasUnvalidatedUseForSubject,
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

  const normalizeItem = (item: unknown) =>
    composerNormalizeField(item as Record<string, unknown>);
  const onBeforeSave = (item: unknown) =>
    handleChangeFields(item as Record<string, unknown>);

  if (onChange) {
    return (
      <>
        {/*
          `ArchitectField` renders this for every field it owns, and the
          Issues panel resolves an issue path to the nearest anchor
          (`candidateIdsFor`). Rendering it here too keeps the DOM seam
          identical either side of the controlled/uncontrolled split.
        */}
        <IssueAnchor fieldName={`${fieldName}._error`} description={label} />
        <UnconnectedField
          name={fieldName}
          label={label}
          labelHidden
          component={DialogArrayField}
          addButtonLabel={addButtonLabel}
          value={value ?? NO_FIELDS}
          onChange={onChange}
          addTitle={title}
          editorTitle={title}
          editorFieldsComponent={EditorFields}
          editorPreviewComponent={EditorPreview}
          editorPreviewProps={COMPOSER_PREVIEW_PROPS}
          editorProps={editorProps}
          editorValidate={editorValidate}
          itemLabelMessage={arrayItemMessages.attribute}
          itemSelector={itemSelector}
          normalizeItem={normalizeItem}
          onBeforeSave={onBeforeSave}
          previewComponent={Preview}
          previewProps={previewProps}
          requestedEditFormName={editFormName}
          sortable
        />
      </>
    );
  }

  return (
    <ArchitectArrayField
      name={fieldName}
      label={label}
      labelHidden
      component={DialogArrayField}
      addButtonLabel={addButtonLabel}
      initialValue={initialValue}
      // Editable attributes are optional (no node/edge attributes is valid).
      validation={{}}
      addTitle={title}
      editorTitle={title}
      editorFieldsComponent={EditorFields}
      editorPreviewComponent={EditorPreview}
      editorPreviewProps={COMPOSER_PREVIEW_PROPS}
      // The editor's variable picker takes the same committed sibling list
      // `editorValidate` gates on, so a variable another attribute already
      // collects is never offered in the first place rather than being offered
      // and then rejected on save.
      editorProps={editorProps}
      editorValidate={editorValidate}
      itemLabelMessage={arrayItemMessages.attribute}
      itemSelector={itemSelector}
      normalizeItem={normalizeItem}
      onBeforeSave={onBeforeSave}
      previewComponent={Preview}
      previewProps={previewProps}
      requestedEditFormName={editFormName}
      sortable
    />
  );
};

export default EditableAttributesList;
