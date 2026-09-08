import { Trash2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
} from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import ArrayField, {
  ArrayFieldDragHandle,
  stripManagedProperties,
  type ArrayFieldItemProps,
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { DEFAULT_ITEM_LABEL } from './arrayMessages.ts';
import RowField from './RowField.tsx';
import { requiredRow } from './rowValidators.ts';
import { useArrayFieldCommands } from './useArrayFieldCommands.ts';
import {
  rowRemovalControlProps,
  useConfirmRowRemoval,
} from './useConfirmRowRemoval.ts';

const messages = defineMessages({
  incompleteRows: {
    id: 'protocolBuilder.multiSelect.incompleteRows',
    defaultMessage: 'Every row needs a value in each column.',
    description:
      'Shown above a list of rows in a stage editor when the researcher tries to save with a row that has an empty cell in it. Each row here is a set of dropdowns filled in together — a sort rule, a display property.',
  },
  removeItem: {
    id: 'protocolBuilder.multiSelect.removeItem',
    defaultMessage: 'Remove item',
    description:
      'Action that deletes one row of a list. Used as the button on the row, as the title of the confirmation it raises, and as that confirmation’s own confirm button.',
  },
  removeItemDescription: {
    id: 'protocolBuilder.multiSelect.removeItemDescription',
    defaultMessage: 'Are you sure you want to remove this item?',
    description:
      'Body of the confirmation raised when a researcher deletes one row of a list.',
  },
  reorderItem: {
    id: 'protocolBuilder.multiSelect.reorderItem',
    defaultMessage: 'Reorder item {position} of {count, number}',
    description:
      'Accessible name of the handle that drags one row of a list into a different position. position is the row’s own place in the list, counting from one; count is how many rows the list holds.',
  },
  emptyState: {
    id: 'protocolBuilder.multiSelect.emptyState',
    defaultMessage: 'No items available.',
    description:
      'Shown in place of the rows when a list has none, and the list’s caller has offered no wording of its own.',
  },
});

// Row background reads `--rule-bg` so callers (e.g. Validations error state)
// can flip it without re-defining the row layout.
const MULTI_SELECT_RULE_CLASSES =
  'flex items-center py-5 bg-(--rule-bg) publish-colors text-sortable-contrast rounded z-1 transition-colors duration-300 ease-in-out';
const MULTI_SELECT_CONTROL_CLASSES = 'flex grow-0 items-center gap-2 px-5';
const MULTI_SELECT_OPTIONS_CLASSES = 'flex-1 flex items-center px-5';
const MULTI_SELECT_OPTION_CLASSES = 'flex flex-1 items-start ml-5 first:ml-0';

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;
const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

const CELL_VALIDATORS = [requiredRow()] as const;

export type PropertyField = {
  fieldName: string;
  control?: 'input' | 'select';
  /**
   * Visible text and accessible name of this column's control — REQUIRED, for
   * the reason `addButtonLabel` below is. It used to default to
   * `startCase(fieldName)`, which builds a label out of a code identifier by
   * capitalising it: a word no translator is ever handed, and one that stays
   * English in every language.
   */
  label: string;
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
 * unanswered.
 */
const isCellEmpty = (cell: unknown) =>
  cell === undefined ||
  cell === null ||
  (typeof cell === 'string' && cell.trim() === '');

/**
 * A column whose cells can hold an id that no longer names anything.
 *
 * Emptiness is all a row can judge for itself, and it is not the whole of
 * "unanswered": a cell holding the id of something that has since been deleted
 * looks answered from here, renders blank (an option list that does not carry
 * the id has nothing to show for it), and saves the dangling reference back.
 * Only the owner knows what its ids name and which of them are gone, so the
 * owner supplies both — the values, and the sentence a row holding one is
 * refused with.
 */
export type DanglingCells = Readonly<{
  fieldName: string;
  /** The values in that column that no longer name anything. */
  values: readonly string[];
  /** What the researcher is told about a row holding one. */
  message: string;
}>;

/** Stable identity for the common case: this is part of a field registration. */
const NO_DANGLING_CELLS: readonly DanglingCells[] = Object.freeze([]);

/**
 * The array-level rule every MultiSelect owner must put on its
 * `ProtocolArrayField` — the counterpart of the `required` the cells carry,
 * which is DISPLAY ONLY because a row is not a registered field (see
 * RowField).
 *
 * Without it a half-finished row (pick a property, leave the direction unset)
 * does not block the save: `{ property: 'name' }` reaches the protocol, fails
 * `SortRuleSchema`, and surfaces as a blocking invalid-protocol failure that
 * names no field.
 *
 * An absent or empty array is the unconfigured state these toggleable sections
 * legitimately sit in and passes; a wholly empty row does not, matching
 * `Options.tsx`'s `completeOptions`.
 *
 * A row is judged empty first and dangling second, so a row that is both is
 * told what it is missing before it is told the id it kept is stale — the
 * ordering `messageRuleValidation` documents, applied within the one rule that
 * owns what "answered" means here.
 */
const completeRows =
  (properties: PropertyField[], dangling: readonly DanglingCells[]) =>
  (value: unknown): string | undefined => {
    const rows = readRows(value);
    if (
      rows.some((row) =>
        properties.some(({ fieldName }) => isCellEmpty(row[fieldName])),
      )
    ) {
      return createMessageError(messages.incompleteRows);
    }
    return dangling.find(({ fieldName, values }) =>
      rows.some((row) => {
        const cell = row[fieldName];
        return typeof cell === 'string' && values.includes(cell);
      }),
    )?.message;
  };

/**
 * Every array-level rule a MultiSelect owner needs, as one object to SPREAD
 * onto the owning `ProtocolArrayField` — the `Options.tsx` `optionsValidation`
 * idiom, so a call site cannot keep some and drop others.
 *
 * A factory because the rule has to know the columns, and — where a column
 * holds references — which of those references have gone stale. Memoize the
 * result on both, so a field prop stops changing while nothing about the rules
 * has.
 *
 * Not because a fresh identity would re-register the rule, which it would not:
 * `useField` keys the registered validation on a `JSON.stringify` of the
 * validation props, and `JSON.stringify` drops a function-valued property
 * entirely — so a `custom` whose `schema` is a function serialises to exactly
 * the key it had before, whatever this factory returns. What keeps the rule
 * current is the other half of that: the registered function reads the props
 * when validation RUNS, through a ref (see `useField`'s `validationPropsRef`).
 * A rule rebuilt to judge against something that has changed — the orphans a
 * `DanglingCells` names, the picks a cross-class gate escapes on — is
 * therefore live without ever re-registering the field, which is what would
 * delete its stored errors mid-edit.
 */
export const makeMultiSelectValidation = (
  properties: PropertyField[],
  dangling: readonly DanglingCells[] = NO_DANGLING_CELLS,
) => ({
  custom: messageRuleValidation([completeRows(properties, dangling)]),
});

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

function MultiSelectRow({
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
  getAddTrigger,
}: ArrayFieldItemProps<ItemValue>) {
  const intl = useAppIntl();
  const { arrayName, properties, options, allValues } = useMultiSelectContext();
  const { rowRef, confirmRemoval } = useConfirmRowRemoval({
    item,
    itemLabel: DEFAULT_ITEM_LABEL,
    index,
    onDelete,
    getAddTrigger,
  });
  const interactionDisabled = disabled || readOnly;
  const rowValues = stripManagedProperties(item);
  // Bind field paths to the committed position, not the live (possibly
  // mid-drag-preview) index, so a reorder preview cannot relabel the rows.
  const rowFieldName = `${arrayName}[${committedIndex ?? index}]`;

  const handleDelete = () => {
    confirmRemoval({
      title: messages.removeItem,
      description: messages.removeItemDescription,
      confirmLabel: messages.removeItem,
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
        .map(({ fieldName }) => [fieldName, undefined]),
    );

    onUpdate?.({ ...reset, [property.fieldName]: value });
  };

  return (
    <div ref={rowRef} className={`group ${MULTI_SELECT_RULE_CLASSES}`}>
      {isSortable && (
        <div className={MULTI_SELECT_CONTROL_CLASSES}>
          <ArrayFieldDragHandle
            dragControls={dragControls}
            index={index}
            itemCount={itemCount}
            onMove={onMove}
            disabled={interactionDisabled}
            label={intl.formatMessage(messages.reorderItem, {
              // The row's own place in the list, which the researcher reads as
              // this row's number rather than as a quantity — so it is passed
              // as they would say it, ungrouped.
              position: String(index + 1),
              count: itemCount,
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
              label,
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
                validators={CELL_VALIDATORS}
                disabled={interactionDisabled}
              />
            </div>
          ),
        )}
      </div>
      <div className={MULTI_SELECT_CONTROL_CLASSES}>
        <IconButton
          {...rowRemovalControlProps}
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
}

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
  maxItems?: number;
};

/**
 * A sortable list of always-editing rows, each a fixed set of selects/inputs.
 *
 * Rendered as `<ProtocolArrayField component={…} … />`, so the whole list
 * arrives as ONE `value`/`onChange` pair; no row is ever registered as a form
 * field. Every section reaches it through `OptionalList`, which is where the
 * decision an EMPTY list records lives: this component renders whatever it is
 * handed and has no opinion about what emptying one means. Row controls therefore run their own validation locally (see
 * RowField) while keeping the `name[i].property` `data-field-name` paths E2E
 * specs target — which is why every owner also passes
 * `validation={{ completeRows: completeRows(properties) }}`, the only rule
 * that can actually refuse a half-finished row.
 */
export default function MultiSelect({
  value = EMPTY_ITEMS,
  emptyStateMessage,
  onChange,
  name = '',
  addButtonLabel,
  properties,
  options,
  maxItems,
  ...arrayFieldProps
}: MultiSelectProps) {
  const intl = useAppIntl();
  const context = useMemo<MultiSelectContextValue>(
    () => ({ arrayName: name, properties, options, allValues: value }),
    [name, options, properties, value],
  );

  const itemTemplate = useCallback(() => ({}), []);
  const { onOperation } = useArrayFieldCommands<ItemValue>(value, onChange);

  return (
    <MultiSelectContext value={context}>
      <div className="flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0">
        <ArrayField<ItemValue>
          {...arrayFieldProps}
          name={name}
          value={value}
          onChange={onChange}
          onOperation={onOperation}
          itemComponent={MultiSelectRow}
          itemTemplate={itemTemplate}
          itemClasses="p-0! shadow-none"
          addButtonLabel={addButtonLabel}
          emptyStateMessage={
            emptyStateMessage ?? intl.formatMessage(messages.emptyState)
          }
          immediateAdd
          sortable
          confirmDelete={false}
          maxItems={maxItems}
        />
      </div>
    </MultiSelectContext>
  );
}
