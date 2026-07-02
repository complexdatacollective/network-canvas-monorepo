import { useMemo } from 'react';

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
}: EditableAttributesListProps) => {
  // OrderedList spreads only the field item onto the preview, so bind the
  // subject (entity/type) here — a node type for node attributes, the edge type
  // for edge attributes — so the preview resolves the variable in the right
  // codebook. Memoised so the preview component reference stays stable.
  const previewComponent = useMemo(
    () =>
      function BoundComposerFieldPreview(itemProps: {
        variable: string;
        component?: string;
      }) {
        return (
          <ComposerFieldPreview {...itemProps} entity={entity} type={type} />
        );
      },
    [entity, type],
  );

  return (
    <EditableList
      editComponent={ComposerAttributeFields}
      editProps={{ type, entity }}
      previewComponent={previewComponent}
      // Editable attributes are optional (no node/edge attributes is valid), so
      // override EditableList's default "at least one item" validator.
      validation={{}}
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
};

export default EditableAttributesList;
