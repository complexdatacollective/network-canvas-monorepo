import { Plus } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { Validator } from 'redux-form';
import { formValueSelector } from 'redux-form';
import { v4 } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { Validation } from '@codaco/protocol-validation';
import ValidatedField from '~/components/Form/ValidatedField';
import OrderedList, {
  type OrderedListProps,
} from '~/components/OrderedList/OrderedList';

import { useFormContext } from '../Editor';
import Layout from '../EditorLayout';
import { MarkdownLabel } from '../Form/Fields';
import Form from '../InlineEditScreen/Form';
import { useEditHandlers } from './useEditHandlers';
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
type EditableListProps = {
  label?: string;
  form?: string;
  editFormName?: string;
  sortMode?: 'manual';
  title: string;
  fieldName?: string;
  sortable?: boolean;
  children?: React.ReactNode;
  previewComponent: React.ElementType;
  editComponent: React.ElementType;
  editProps?: Record<string, unknown>;
  validation?: Record<string, Validator> | Partial<Validation>;
  // Optional props for customizing hook behavior
  onChange?: (value: unknown) => unknown;
  normalize?: (value: unknown) => unknown;
  template?: () => Record<string, unknown>;
  itemSelector?: (
    state: Record<string, unknown>,
    params: {
      form: string;
      editField: string;
    },
  ) => unknown;
};
const EditableList = ({
  label,
  fieldName = 'prompts',
  children = null,
  validation = { notEmpty },
  editComponent: EditComponent,
  title,
  editProps = {},
  previewComponent: PreviewComponent,
  onChange,
  normalize = (value) => value, // Function to normalize the value before saving
  template = () => ({ id: v4() }), // Function to provide a template for new items
  sortable = true,
  itemSelector,
  form: formProp,
  editFormName = 'editable-list-form',
}: EditableListProps) => {
  const { form: contextForm } = useFormContext();
  const form = formProp ?? contextForm;
  const {
    editIndex,
    handleTriggerEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleAddNew,
  } = useEditHandlers({
    fieldName,
    form,
    onChange,
    normalize,
    template,
  });
  const isOpen = editIndex !== null;
  // Get current item values for editing & enrich with codebook data using itemSelector
  const currentItemValues = useSelector((state: Record<string, unknown>) => {
    if (editIndex === null) return null;
    const editFieldPath = `${fieldName}[${editIndex}]`;
    if (itemSelector) {
      return itemSelector(state, { form, editField: editFieldPath });
    }
    const selector = formValueSelector(form);
    return selector(state, `${fieldName}[${editIndex}]`);
  });
  // Memoize template result to prevent form reinitialization
  // Note: a unique `id` is assigned to every new item unless the template
  // supplies a non-empty one; an empty-string id would collide across items.
  const templateValues = useMemo(() => {
    // Recompute whenever the edited item changes so each newly opened item gets
    // a fresh id even when the template function is stable.
    void editIndex;
    const customTemplate = template();
    const templateId = customTemplate.id;
    return {
      ...customTemplate,
      id: typeof templateId === 'string' && templateId ? templateId : v4(),
    };
  }, [template, editIndex]);
  const initialValuesForEdit = isRecord(currentItemValues)
    ? currentItemValues
    : templateValues;
  return (
    <div className="flex flex-col items-start gap-5">
      {label && (
        <Heading level="h4">
          <MarkdownLabel label={label} />
        </Heading>
      )}
      {children}
      <ValidatedField<OrderedListProps>
        name={fieldName}
        component={OrderedList}
        validation={validation}
        componentProps={{
          sortable,
          item: PreviewComponent,
          onClickItem: handleTriggerEdit,
          editIndex: editIndex, // Pass editIndex so it can be used in layout ID
        }}
      />
      <Button onClick={handleAddNew} icon={<Plus />} color="primary">
        Create new
      </Button>

      <Dialog
        open={isOpen}
        closeDialog={handleCancelEdit}
        layoutId={`${fieldName}-edit-field-${editIndex}`}
        title={title}
        footer={
          <>
            <Button color="default" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button type="submit" form={editFormName} color="primary">
              Save
            </Button>
          </>
        }
      >
        <Form
          form={editFormName}
          id={editFormName}
          onSubmit={handleSaveEdit}
          initialValues={initialValuesForEdit}
        >
          <Layout>
            <EditComponent
              {...(initialValuesForEdit as Record<string, unknown>)}
              {...editProps}
              form={editFormName}
            />
          </Layout>
        </Form>
      </Dialog>
    </div>
  );
};
export default EditableList;
