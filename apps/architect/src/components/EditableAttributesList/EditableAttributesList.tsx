import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedField from '~/components/Form/ValidatedField';

import ComposerFieldPreview from '../sections/Form/ComposerFieldPreview';
import {
  composerItemSelector,
  composerNormalizeField,
} from '../sections/Form/composerHelpers';
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
}: EditableAttributesListProps) => (
  <ValidatedField
    name={fieldName}
    component={DialogArrayField}
    // Editable attributes are optional (no node/edge attributes is valid).
    validation={{}}
    componentProps={{
      addTitle: title,
      editorFieldsComponent: ComposerAttributeFields,
      editorProps: { type, entity },
      editorTitle: title,
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

export default EditableAttributesList;
