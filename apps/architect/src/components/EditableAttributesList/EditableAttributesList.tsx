import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';

import ComposerFieldPreview from '../sections/Form/ComposerFieldPreview';
import {
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
  const editorValidate = useMemo(
    () => makeFieldEditorValidate(allVariables),
    [allVariables],
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
