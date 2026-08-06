import { startCase } from 'es-toolkit/compat';
import { Trash2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
} from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ArrayField, {
  ArrayFieldDragHandle,
  type ArrayFieldItemProps,
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';

import RowField from './RowField';

// Row background reads `--rule-bg` so callers (e.g. Validations error state)
// can flip it without re-defining the row layout. The redux-form module still
// owns the exported copies these mirror, until stage E deletes it.
const MULTI_SELECT_RULE_CLASSES =
  'flex items-center py-5 bg-(--rule-bg) publish-colors text-sortable-contrast rounded z-1 transition-colors duration-300 ease-in-out';
const MULTI_SELECT_CONTROL_CLASSES = 'flex grow-0 items-center gap-2 px-5';
const MULTI_SELECT_OPTIONS_CLASSES = 'flex-1 flex items-center px-5';
const MULTI_SELECT_OPTION_CLASSES = 'flex flex-1 items-start ml-5 first:ml-0';

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;
const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

export type PropertyField = {
  fieldName: string;
  control?: 'input' | 'select';
  /** Defaults to `startCase(fieldName)`. */
  label?: string;
  placeholder?: string;
};

export type ItemValue = Record<string, unknown>;

export type OptionGetter = (
  fieldName: string,
  rowValues: unknown,
  allValues: unknown,
) => Array<Record<string, unknown>>;

const stripManagedProperties = (item: Partial<ItemValue>): ItemValue => {
  const { _internalId, _draft, ...value } = item;
  return value;
};

type MultiSelectContextValue = {
  arrayName: string;
  properties: PropertyField[];
  options: OptionGetter;
  allValues: ItemValue[];
};

// A module-level row component keeps ArrayField from remounting (and blurring)
// the row on every keystroke; its configuration arrives by context.
const MultiSelectContext = createContext<MultiSelectContextValue | null>(null);

const useMultiSelectContext = () => {
  const context = useContext(MultiSelectContext);
  if (!context) {
    throw new Error('MultiSelect rows must be rendered inside MultiSelect.');
  }
  return context;
};

const MultiSelectRow = ({
  item,
  index,
  committedIndex,
  itemCount,
  isSortable,
  dragControls,
  onMove,
  onUpdate,
  onDelete,
  disabled,
  readOnly,
}: ArrayFieldItemProps<ItemValue>) => {
  const { arrayName, properties, options, allValues } = useMultiSelectContext();
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;
  const rowValues = stripManagedProperties(item);
  // Bind field paths to the committed position, not the live (possibly
  // mid-drag-preview) index, so a reorder preview cannot relabel the rows.
  const rowFieldName = `${arrayName}[${committedIndex ?? index}]`;

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

  // Each property narrows the next one's option list, so a change invalidates
  // every property after it in the row.
  const handleChange = (propertyIndex: number, value: unknown) => {
    const property = properties[propertyIndex];
    if (!property) return;

    const reset = Object.fromEntries(
      properties
        .slice(propertyIndex + 1)
        .map(({ fieldName }) => [fieldName, null]),
    );

    onUpdate({ ...reset, [property.fieldName]: value });
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
          ) => (
            <div
              className={MULTI_SELECT_OPTION_CLASSES}
              key={propertyFieldName}
            >
              <RowField
                {...rest}
                name={`${rowFieldName}.${propertyFieldName}`}
                label={label}
                component={
                  control === 'input'
                    ? FrescoInputField
                    : FrescoNativeSelectField
                }
                {...(control === 'select'
                  ? {
                      options: options(propertyFieldName, rowValues, allValues),
                    }
                  : {})}
                value={rowValues[propertyFieldName]}
                onChange={(value: unknown) =>
                  handleChange(propertyIndex, value)
                }
                validation={{ required: true }}
                disabled={interactionDisabled}
              />
            </div>
          ),
        )}
      </div>
      <div className={MULTI_SELECT_CONTROL_CLASSES}>
        <IconButton
          icon={<Trash2 />}
          aria-label="Remove item"
          color="destructive"
          disabled={interactionDisabled}
          className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={handleDelete}
        />
      </div>
    </div>
  );
};

const EMPTY_ITEMS: ItemValue[] = [];

export type MultiSelectProps = Omit<
  ArrayFieldProps<ItemValue>,
  | 'addButtonLabel'
  | 'confirmDelete'
  | 'editorComponent'
  | 'emptyStateMessage'
  | 'immediateAdd'
  | 'itemClasses'
  | 'itemComponent'
  | 'itemTemplate'
  | 'maxItems'
  | 'onOperation'
  | 'sortable'
> & {
  /** One column per entry, in order; each narrows the next one's options. */
  properties: PropertyField[];
  /** Supplies the option list for a select column, per row. */
  options: OptionGetter;
  maxItems?: number | null;
};

/**
 * The fresco-ui-native successor to `~/components/Form/MultiSelect.tsx`: a
 * sortable list of always-editing rows, each a fixed set of selects/inputs.
 *
 * Rendered as `<ArchitectArrayField component={MultiSelect} … />`, so the
 * whole list arrives as ONE `value`/`onChange` pair; no row is ever registered
 * as a form field. Row controls therefore run their own validation locally
 * (see RowField) while keeping the `name[i].property` `data-field-name` paths
 * E2E specs target.
 */
const MultiSelect = ({
  value = EMPTY_ITEMS,
  onChange,
  name = '',
  properties,
  options,
  maxItems = null,
  ...arrayFieldProps
}: MultiSelectProps) => {
  const context = useMemo<MultiSelectContextValue>(
    () => ({ arrayName: name, properties, options, allValues: value }),
    [name, options, properties, value],
  );

  const itemTemplate = useCallback(() => ({}), []);

  return (
    <MultiSelectContext.Provider value={context}>
      <div className="flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0">
        <ArrayField<ItemValue>
          {...arrayFieldProps}
          name={name}
          value={value}
          onChange={onChange}
          itemComponent={MultiSelectRow}
          itemTemplate={itemTemplate}
          itemClasses="p-0! shadow-none"
          addButtonLabel="Add new"
          emptyStateMessage="No properties available."
          immediateAdd
          sortable
          confirmDelete={false}
          maxItems={maxItems ?? undefined}
        />
      </div>
    </MultiSelectContext.Provider>
  );
};

export default MultiSelect;
