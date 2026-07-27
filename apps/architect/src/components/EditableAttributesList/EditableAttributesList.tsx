import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';

import ComposerFieldPreview from '../sections/Form/ComposerFieldPreview';
import {
  buildComposerFieldOverlay,
  composerItemSelector,
  composerNormalizeField,
} from '../sections/Form/composerHelpers';
import { makeFieldEditorValidate } from '../Validations/contradictions';
import ComposerAttributeFields from './ComposerAttributeFields';

type EditableAttributesListProps = {
  fieldName: string;
  entity: 'node' | 'edge';
  type: string | null;
  form: string;
  editFormName?: string;
  title?: string;
  handleChangeFields: (field: Record<string, unknown>) => unknown;
};

const EditableAttributesList = ({
  fieldName,
  entity,
  type,
  form,
  editFormName = 'editable-list-form',
  title = 'Edit attribute',
  handleChangeFields,
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
        props?: { editIndex?: number },
      ): Record<string, unknown> =>
        makeFieldEditorValidate(
          allVariables,
          buildComposerFieldOverlay(composerFields, props?.editIndex),
        )(values),
    [allVariables, composerFields],
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
        editorProps: { type, entity },
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
