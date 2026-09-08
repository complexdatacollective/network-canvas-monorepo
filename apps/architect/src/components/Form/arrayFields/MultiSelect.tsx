import { Trash2 } from 'lucide-react';
import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ArrayField, {
  ArrayFieldDragHandle,
  stripManagedProperties,
  type ArrayFieldItemProps,
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';

import RowField from './RowField';
const defaultMessages = defineMessages({
  emptyStateMessage: {
    id: 'architect.defaults.components.Form.arrayFields.MultiSelect.emptyStateMessage',
    defaultMessage: 'No items available.',
    description:
      'Default researcher-facing copy when the caller does not supply its own emptyStateMessage.',
  },
});
const messages = defineMessages({
  removeItem: {
    id: 'architect.form.arrayFields.multiSelect.removeItem',
    defaultMessage: 'Remove item',
    description:
      'The title text in components / Form / arrayFields / MultiSelect.',
  },
  areYouSureYouWantTo: {
    id: 'architect.form.arrayFields.multiSelect.areYouSureYouWantTo',
    defaultMessage: 'Are you sure you want to remove this item?',
    description:
      'The description text in components / Form / arrayFields / MultiSelect.',
  },
  reorderItemOf: {
    id: 'architect.form.arrayFields.multiSelect.reorderItemOf',
    defaultMessage: 'Reorder item {value1, number} of {itemCount, number}',
    description:
      'The label text in components / Form / arrayFields / MultiSelect.',
  },
});
const rowMessages = defineMessages({
  complete: {
    id: 'architect.arrayRows.complete',
    defaultMessage: 'Every row needs a value in each column.',
    description:
      'Validation error for an incomplete row of display or sorting properties.',
  },
});

// Row background reads `--rule-bg` so callers (e.g. Validations error state)
// can flip it without re-defining the row layout.
export const MULTI_SELECT_RULE_CLASSES =
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

const readRows = (value: unknown): ItemValue[] =>
  Array.isArray(value)
    ? value.filter(
        (row): row is ItemValue => typeof row === 'object' && row !== null,
      )
    : [];

/**
 * Judged the way the cells' own `required` judges emptiness (fresco-ui trims
 * strings), so the array and its rows never disagree about which cell is
 * unanswered. Stricter than `prune`, which keeps `''` — anything this accepts
 * therefore survives the commit-time prune as a real value.
 */
const isCellEmpty = (cell: unknown) =>
  cell === undefined ||
  cell === null ||
  (typeof cell === 'string' && cell.trim() === '');

/**
 * The array-level rule every MultiSelect owner must pass as its
 * `ArchitectArrayField`'s `validation` — the counterpart of the `required` the
 * cells carry, which is DISPLAY ONLY because a row is not a registered field
 * (see RowField).
 *
 * Without it a half-finished row (pick a property, leave the direction unset)
 * does not block "Finished Editing": `prune` strips only the empty cell, so
 * `{ property: 'name' }` reaches the protocol, fails `SortRuleSchema`, and
 * surfaces as the blocking invalid-protocol dialog — which names no field and
 * offers only to revert the editing session.
 *
 * An absent or empty array is the unconfigured state these toggleable sections
 * legitimately sit in and passes; a wholly empty row does not, matching
 * `Options.tsx`'s `completeOptions` (and pre-migration behaviour, where both
 * cells were registered required fields).
 */
const defaultIntl = createAppIntl({ locale: 'en' });

export const completeRows =
  (properties: PropertyField[], intl: IntlShape = defaultIntl) =>
  (value: unknown): string | undefined =>
    readRows(value).some((row) =>
      properties.some(({ fieldName }) => isCellEmpty(row[fieldName])),
    )
      ? intl.formatMessage(rowMessages.complete)
      : undefined;

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
  const intl = useAppIntl();
  const { arrayName, properties, options, allValues } = useMultiSelectContext();
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;
  const rowValues = stripManagedProperties(item);
  // Bind field paths to the committed position, not the live (possibly
  // mid-drag-preview) index, so a reorder preview cannot relabel the rows.
  const rowFieldName = `${arrayName}[${committedIndex ?? index}]`;

  const handleDelete = () => {
    void confirm({
      title: createElement(AppMessage, { message: messages.removeItem }),
      description: createElement(AppMessage, {
        message: messages.areYouSureYouWantTo,
      }),
      confirmLabel: createElement(AppMessage, { message: messages.removeItem }),
      cancelLabel: createElement(AppMessage, {
        message: commonMessages.cancel,
      }),
      intent: 'destructive',
      onConfirm: () => onDelete?.(),
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

    onUpdate?.({ ...reset, [property.fieldName]: value });
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
            label={intl.formatMessage(messages.reorderItemOf, {
              value1: index + 1,
              itemCount: itemCount,
            })}
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
              label = propertyFieldName in propertyMessages
                ? intl.formatMessage(
                    propertyMessages[
                      propertyFieldName as keyof typeof propertyMessages
                    ],
                  )
                : propertyFieldName,
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
          aria-label={intl.formatMessage(messages.removeItem)}
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
  | 'immediateAdd'
  | 'itemClasses'
  | 'itemComponent'
  | 'itemTemplate'
  | 'maxItems'
  | 'onOperation'
  | 'sortable'
> & {
  /**
   * Visible text and accessible name of the add button — REQUIRED, and a whole
   * string rather than an `Add new ${itemLabel}` template, so it can be
   * localised and so no call site can fall back to a generic default.
   *
   * One surface mounts several of these at once: a Categorical or Ordinal Bin
   * prompt editor has a bucket sort order and a bin sort order, and a roster
   * stage has an initial sort order, a sortable-property list and a
   * display-property list. Named "Add new", every one of them is the same
   * control to anyone navigating by a list of buttons (#1391).
   */
  addButtonLabel: string;
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
 * E2E specs target — which is why every owner also passes
 * `validation={{ completeRows: completeRows(properties) }}`, the only rule
 * that can actually refuse a half-finished row.
 */
const MultiSelect = ({
  value = EMPTY_ITEMS,
  emptyStateMessage: providedEmptyStateMessage,
  onChange,
  name = '',
  addButtonLabel,
  properties,
  options,
  maxItems = null,
  ...arrayFieldProps
}: MultiSelectProps) => {
  const intl = useAppIntl();
  const emptyStateMessage =
    providedEmptyStateMessage ??
    intl.formatMessage(defaultMessages.emptyStateMessage);
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
          addButtonLabel={addButtonLabel}
          emptyStateMessage={emptyStateMessage}
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

const propertyMessages = defineMessages({
  property: {
    id: 'architect.arrayField.column.property',
    defaultMessage: 'Property',
    description: 'Researcher-facing Architect control or feedback.',
  },
  direction: {
    id: 'architect.arrayField.column.direction',
    defaultMessage: 'Direction',
    description: 'Researcher-facing Architect control or feedback.',
  },
  variable: {
    id: 'architect.arrayField.column.variable',
    defaultMessage: 'Attribute',
    description: 'Researcher-facing Architect control or feedback.',
  },
  label: {
    id: 'architect.arrayField.column.label',
    defaultMessage: 'Label',
    description: 'Researcher-facing Architect control or feedback.',
  },
  value: {
    id: 'architect.arrayField.column.value',
    defaultMessage: 'Value',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
