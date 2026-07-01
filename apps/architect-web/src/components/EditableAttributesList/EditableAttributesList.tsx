import EditableList from '~/components/EditableList';

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
  handleChangeFields: (fields: Array<Record<string, unknown>>) => void;
};

const EditableAttributesList = ({
  fieldName,
  entity,
  type,
  form,
  editFormName = 'editable-list-form',
  title = 'Edit attribute',
  handleChangeFields,
}: EditableAttributesListProps) => (
  <EditableList
    editComponent={ComposerAttributeFields}
    editProps={{ type, entity }}
    previewComponent={ComposerFieldPreview}
    fieldName={fieldName}
    title={title}
    editFormName={editFormName}
    onChange={(value: unknown) =>
      handleChangeFields(value as Array<Record<string, unknown>>)
    }
    normalize={(value: unknown) =>
      composerNormalizeField(value as Record<string, unknown>)
    }
    itemSelector={
      composerItemSelector(entity, type) as (
        state: Record<string, unknown>,
        params: { form: string; editField: string },
      ) => unknown
    }
    form={form}
  />
);

export default EditableAttributesList;
