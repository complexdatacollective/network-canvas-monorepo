import { startCase } from 'es-toolkit/compat';
import { Trash2 } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { UnknownAction } from 'redux';
import { change, FieldArray, formValueSelector } from 'redux-form';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
// Row background reads `--rule-bg` so callers (e.g. Validations error state)
// can flip it without re-defining the row layout.
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import FrescoReduxArrayField, {
  type FrescoReduxArrayFieldItemProps,
} from './FrescoReduxArrayField';
import FrescoReduxField from './FrescoReduxField';
import ValidatedField from './ValidatedField';

const FrescoNativeSelectField = NativeSelectField as React.ComponentType<
  Record<string, unknown>
>;
const FrescoInputField = InputField as React.ComponentType<
  Record<string, unknown>
>;

export const MULTI_SELECT_RULE_CLASSES =
  'flex items-center py-5 bg-(--rule-bg) publish-colors text-sortable-contrast rounded z-1 transition-colors duration-300 ease-in-out';
export const MULTI_SELECT_CONTROL_CLASSES = 'flex grow-0 items-center px-5';
export const MULTI_SELECT_OPTIONS_CLASSES = 'flex-1 flex items-center px-5';
export const MULTI_SELECT_OPTION_CLASSES =
  'flex flex-1 items-start ml-5 first:ml-0';
type PropertyField = {
  fieldName: string;
  control?: 'input' | 'select';
  label?: string;
  [key: string]: unknown;
};
type ItemValue = {
  [key: string]: unknown;
};

type OptionGetter = (
  fieldName: string,
  rowValues: unknown,
  allValues: unknown,
) => Array<Record<string, unknown>>;

type ItemComponentProps = FrescoReduxArrayFieldItemProps<ItemValue> & {
  properties: PropertyField[];
  options: OptionGetter;
};

const ItemComponent: React.FC<ItemComponentProps> = ({
  arrayName,
  fieldName: rowFieldName,
  form,
  properties,
  options,
  index,
  itemCount,
  isSortable,
  dragControls,
  onMove,
  onDelete,
  disabled,
  readOnly,
}) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;
  const rowValues = useSelector(
    (state: RootState) =>
      formValueSelector(form)(state, rowFieldName) as ItemValue | undefined,
  );
  const allValues = useSelector(
    (state: RootState) =>
      formValueSelector(form)(state, arrayName) as ItemValue[] | undefined,
  );

  const handleDelete = () => {
    void confirm({
      title: 'Remove item',
      description: 'Are you sure you want to remove this item?',
      confirmLabel: 'Remove item',
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: onDelete,
    });
  };

  const handleChange = (changedIndex: number) => {
    // Reset any fields after this one in the property index
    for (const { fieldName: propertyFieldName } of properties.slice(
      changedIndex + 1,
    )) {
      dispatch(
        change(
          form,
          `${rowFieldName}.${propertyFieldName}`,
          null,
        ) as UnknownAction,
      );
    }
  };

  return (
    <div className={`group ${MULTI_SELECT_RULE_CLASSES}`}>
      {isSortable && (
        <div className={MULTI_SELECT_CONTROL_CLASSES}>
          <ArrayFieldDragHandle
            dragControls={dragControls}
            index={index}
            itemCount={itemCount}
            onMove={onMove}
            disabled={interactionDisabled}
            label={`Reorder item ${index + 1} of ${itemCount}`}
            size="md"
            className="text-sortable-contrast"
          />
        </div>
      )}

      <div className={MULTI_SELECT_OPTIONS_CLASSES}>
        {properties.map(
          (
            {
              fieldName: propertyFieldName,
              control = 'select',
              label = startCase(propertyFieldName),
              ...rest
            },
            propertyIndex,
          ) => {
            const componentProps = {
              ...rest,
              label,
              fieldComponent:
                control === 'input'
                  ? FrescoInputField
                  : FrescoNativeSelectField,
              ...(control === 'select'
                ? {
                    options: options(propertyFieldName, rowValues, allValues),
                  }
                : {}),
            };
            return (
              <div
                className={MULTI_SELECT_OPTION_CLASSES}
                key={propertyFieldName}
              >
                <ValidatedField
                  component={FrescoReduxField}
                  name={`${rowFieldName}.${propertyFieldName}`}
                  componentProps={componentProps}
                  validation={{ required: true }}
                  onChange={() => handleChange(propertyIndex)}
                />
              </div>
            );
          },
        )}
      </div>
      <div className={MULTI_SELECT_CONTROL_CLASSES}>
        <IconButton
          icon={<Trash2 />}
          aria-label="Remove item"
          size="md"
          variant="text"
          color="destructive"
          disabled={interactionDisabled}
          className="hover:enabled:bg-destructive hover:enabled:text-destructive-contrast text-current opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={handleDelete}
        />
      </div>
    </div>
  );
};

type MultiSelectProps = {
  name: string;
  properties: PropertyField[];
  options: OptionGetter;
  label?: string;
  maxItems?: number | null;
};
const MultiSelect = ({
  name,
  properties,
  options,
  label = '',
  maxItems = null,
}: MultiSelectProps) => (
  <div className="flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0">
    <FieldArray
      name={name}
      component={FrescoReduxArrayField}
      label={label}
      itemComponent={ItemComponent}
      itemComponentProps={{ properties, options }}
      itemTemplate={() => ({})}
      itemClasses="p-0! shadow-none"
      addButtonLabel="Add new"
      emptyStateMessage="No properties available."
      immediateAdd
      sortable
      confirmDelete={false}
      rerenderOnEveryChange
      maxItems={maxItems ?? undefined}
    />
  </div>
);
export default MultiSelect;
