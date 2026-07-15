import { Pencil, Trash2 } from 'lucide-react';
import {
  createElement,
  type ComponentType,
  useEffect,
  useRef,
  useState,
} from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import { isSubmitting, type WrappedFieldArrayProps } from 'redux-form';
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
          size="lg"
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
        size="lg"
        color="dynamic"
        disabled={interactionDisabled}
        onClick={onEdit}
      />
      <IconButton
        icon={<Trash2 />}
        aria-label={`Remove ${itemLabel}`}
        size="lg"
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

  const editFormName =
    requestedEditFormName ??
    `${form}-${arrayName.replaceAll(/[^a-zA-Z0-9]+/g, '-')}-item-editor`;
  const initialValues = isRecord(selectedItem)
    ? selectedItem
    : stripManagedProperties(item);
  const reduxFormIsSubmitting = useSelector(isSubmitting(editFormName));
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const activeItemIdRef = useRef(item?._internalId);
  activeItemIdRef.current = item?._internalId;
  const [saveInFlight, setSaveInFlight] = useState(false);
  const isBusy = reduxFormIsSubmitting || saveInFlight;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleCancel = () => {
    if (!saveInFlightRef.current) onCancel();
  };

  const handleSave = async (value: unknown) => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaveInFlight(true);
    const itemIdAtSaveStart = item?._internalId;

    try {
      let valueToSave = value;
      if (onBeforeSave) {
        const transformedValue = await onBeforeSave(value);
        if (transformedValue !== undefined) valueToSave = transformedValue;
      }

      if (
        !mountedRef.current ||
        activeItemIdRef.current !== itemIdAtSaveStart
      ) {
        return;
      }
      onSave(normalizeItem(valueToSave) as ArrayItem);
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) setSaveInFlight(false);
    }
  };

  return (
    <Dialog
      open={!!item}
      closeDialog={handleCancel}
      dismissible={!isBusy}
      layoutId={!isNewItem && item ? item._internalId : undefined}
      style={{ borderRadius: 'var(--radius)' }}
      title={isNewItem ? addTitle : editorTitle}
      size="editor"
      footer={
        <>
          <Button type="button" onClick={handleCancel} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={editFormName}
            color="primary"
            disabled={isBusy}
          >
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
  DialogArrayFieldBase as ComponentType<WrappedFieldArrayProps> &
    ComponentType<Record<string, unknown>>;

export default DialogArrayField;
