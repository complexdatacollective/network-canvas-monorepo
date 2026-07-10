import { Pencil, Trash2 } from 'lucide-react';
import { createElement, type ComponentType } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import type { WrappedFieldProps } from 'redux-form';
import { v4 as uuid } from 'uuid';

import Button, { IconButton } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import type { RootState } from '~/ducks/modules/root';

import Layout from '../EditorLayout';
import Form from '../InlineEditScreen/Form';
import {
  FrescoReduxArrayFieldBase,
  type FrescoReduxArrayFieldEditorProps,
  type FrescoReduxArrayFieldItemProps,
  type FrescoReduxArrayFieldProps,
} from './FrescoReduxArrayField';

type ArrayItem = Record<string, unknown>;
type Renderer = ComponentType<Record<string, unknown>>;

type ItemSelector = (
  state: RootState,
  params: { form: string; editField: string },
) => unknown;

type DialogItemProps = FrescoReduxArrayFieldItemProps<ArrayItem> & {
  itemLabel: string;
  previewComponent: Renderer;
  previewProps?: Record<string, unknown>;
};

const stripManagedProperties = (
  item: Partial<ArrayItem> | undefined,
): ArrayItem => {
  if (!item) return {};
  const { _internalId, _draft, ...value } = item;
  return value;
};

const isRecord = (value: unknown): value is ArrayItem =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DialogItem = ({
  item,
  index,
  itemCount,
  isSortable,
  isBeingEdited,
  dragControls,
  onMove,
  onEdit,
  onDelete,
  disabled,
  readOnly,
  form,
  fieldName,
  previewComponent,
  previewProps,
  itemLabel,
}: DialogItemProps) => {
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;
  const itemValue = stripManagedProperties(item);

  const handleDelete = () => {
    void confirm({
      title: `Remove this ${itemLabel}?`,
      description: `This ${itemLabel} will be removed from the list.`,
      confirmLabel: `Remove ${itemLabel}`,
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: () => onDelete(),
    });
  };

  if (isBeingEdited || item._draft) return null;

  return (
    <div className="flex w-full items-center gap-3">
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={interactionDisabled}
          label={`Reorder ${itemLabel} ${index + 1} of ${itemCount}`}
        />
      )}
      <div className="min-w-0 flex-1">
        {createElement(previewComponent, {
          ...previewProps,
          ...itemValue,
          fieldId: fieldName,
          form,
          sortable: isSortable,
        })}
      </div>
      <IconButton
        icon={<Pencil />}
        aria-label={`Edit ${itemLabel}`}
        size="sm"
        variant="text"
        color="dynamic"
        disabled={interactionDisabled}
        onClick={onEdit}
      />
      <IconButton
        icon={<Trash2 />}
        aria-label={`Remove ${itemLabel}`}
        size="sm"
        variant="text"
        color="destructive"
        disabled={interactionDisabled}
        onClick={handleDelete}
      />
    </div>
  );
};

type DialogEditorProps = FrescoReduxArrayFieldEditorProps<ArrayItem> & {
  addTitle: string;
  editorFieldsComponent: Renderer;
  editorProps?: Record<string, unknown>;
  editorTitle: string;
  itemSelector?: ItemSelector;
  normalizeItem: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
  requestedEditFormName?: string;
};

const DialogEditor = ({
  item,
  isNewItem,
  onSave,
  onCancel,
  arrayName,
  fieldName,
  form,
  addTitle,
  editorFieldsComponent,
  editorProps,
  editorTitle,
  itemSelector,
  normalizeItem,
  onBeforeSave,
  requestedEditFormName,
}: DialogEditorProps) => {
  const selectedItem = useSelector((state: RootState) => {
    if (isNewItem || !fieldName || !itemSelector) return null;
    return itemSelector(state, { form, editField: fieldName });
  }, shallowEqual);

  if (!item) return null;

  const editFormName =
    requestedEditFormName ??
    `${form}-${arrayName.replaceAll(/[^a-zA-Z0-9]+/g, '-')}-item-editor`;
  const initialValues = isRecord(selectedItem)
    ? selectedItem
    : stripManagedProperties(item);

  const handleSave = async (value: unknown) => {
    let valueToSave = value;
    if (onBeforeSave) {
      const transformedValue = await onBeforeSave(value);
      if (transformedValue !== undefined) valueToSave = transformedValue;
    }

    onSave(normalizeItem(valueToSave) as ArrayItem);
  };

  return (
    <Dialog
      open
      closeDialog={onCancel}
      layoutId={isNewItem ? undefined : item._internalId}
      style={{ borderRadius: 'var(--radius)' }}
      title={isNewItem ? addTitle : editorTitle}
      size="editor"
      footer={
        <>
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form={editFormName} color="primary">
            {isNewItem ? 'Add' : 'Save'}
          </Button>
        </>
      }
    >
      <Form
        form={editFormName}
        id={editFormName}
        onSubmit={handleSave}
        initialValues={initialValues}
      >
        <Layout>
          {createElement(editorFieldsComponent, {
            ...initialValues,
            ...editorProps,
            form: editFormName,
          })}
        </Layout>
      </Form>
    </Dialog>
  );
};

type DialogArrayFieldOwnProps<T extends ArrayItem> = Omit<
  FrescoReduxArrayFieldProps<T>,
  | 'confirmDelete'
  | 'editorComponent'
  | 'editorComponentProps'
  | 'itemComponent'
  | 'itemComponentProps'
  | 'itemTemplate'
> & {
  addTitle?: string;
  editorFieldsComponent: Renderer;
  editorProps?: Record<string, unknown>;
  editorTitle: string;
  itemLabel?: string;
  itemSelector?: ItemSelector;
  itemTemplate?: () => Partial<T>;
  normalizeItem?: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
  previewComponent: Renderer;
  previewProps?: Record<string, unknown>;
  requestedEditFormName?: string;
};

export type DialogArrayFieldProps<T extends ArrayItem> =
  DialogArrayFieldOwnProps<T>;

function DialogArrayFieldBase<T extends ArrayItem>({
  addTitle,
  editorFieldsComponent,
  editorProps,
  editorTitle,
  itemLabel = 'item',
  itemSelector,
  itemTemplate = () => ({}),
  normalizeItem = (value) => value,
  onBeforeSave,
  previewComponent,
  previewProps,
  requestedEditFormName,
  addButtonLabel = 'Create new',
  emptyStateMessage = 'No items have been created yet.',
  getId,
  itemClasses,
  ...fieldProps
}: DialogArrayFieldProps<T>) {
  const createItem = () => {
    const item = itemTemplate();
    return {
      ...item,
      id: typeof item.id === 'string' && item.id.length > 0 ? item.id : uuid(),
    } as Partial<T>;
  };

  return (
    <FrescoReduxArrayFieldBase<T>
      {...fieldProps}
      addButtonLabel={addButtonLabel}
      emptyStateMessage={emptyStateMessage}
      itemTemplate={createItem}
      getId={
        getId ??
        ((candidate) =>
          typeof candidate.id === 'string' ? candidate.id : undefined)
      }
      itemClasses={
        itemClasses ?? 'bg-accent text-accent-contrast elevation-low'
      }
      confirmDelete={false}
      itemComponent={
        DialogItem as ComponentType<FrescoReduxArrayFieldItemProps<T>>
      }
      itemComponentProps={{
        itemLabel,
        previewComponent,
        previewProps,
      }}
      editorComponent={
        DialogEditor as ComponentType<FrescoReduxArrayFieldEditorProps<T>>
      }
      editorComponentProps={{
        addTitle: addTitle ?? `Add ${itemLabel}`,
        editorFieldsComponent,
        editorProps,
        editorTitle,
        itemSelector,
        normalizeItem,
        onBeforeSave,
        requestedEditFormName,
      }}
    />
  );
}

const DialogArrayField =
  DialogArrayFieldBase as ComponentType<WrappedFieldProps> &
    ComponentType<Record<string, unknown>>;

export default DialogArrayField;
