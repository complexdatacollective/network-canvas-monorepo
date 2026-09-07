import { toNumber } from 'es-toolkit/compat';
import { Check, Pencil, Trash2 } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';

import { defineMessage, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  ArrayFieldDragHandle,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableOptions } from '@codaco/protocol-validation';
import { toCanonicalText } from '@codaco/shared-consts';

import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
  type RichTextContent,
} from '../../markdown/markdownAdapter.ts';
import {
  isOptionComplete,
  isOptionLabelEmpty,
  isOptionValueEmpty,
} from './optionCompleteness.ts';
import RowField from './RowField.tsx';
import {
  allowedVariableNameRow,
  requiredRow,
  uniqueRowAttribute,
} from './rowValidators.ts';
import {
  rowRemovalControlProps,
  useConfirmRowRemoval,
} from './useConfirmRowRemoval.ts';

/**
 * What one row of this list is called inside sentences about it.
 *
 * A descriptor rather than a word, because every one of those sentences is
 * either formatted where it is read or encoded for a reader further on: a noun
 * resolved here would be resolved in whichever language happened to be current
 * when the row was rendered, not the one the sentence is read in. See
 * `arrayMessages`.
 */
const optionNoun = defineMessage({
  id: 'protocolBuilder.option.optionNoun',
  defaultMessage: 'option',
  description:
    'Noun for one row of the list of options a categorical or ordinal attribute offers. Interpolated mid-sentence into things said ABOUT a row ("This option was replaced…"), so it is lower case and singular.',
});

const messages = defineMessages({
  removeOption: {
    id: 'protocolBuilder.option.removeOption',
    defaultMessage: 'Remove option',
    description:
      'Action that deletes one option from the list. Used as the title of the confirmation it raises and as that confirmation’s own confirm button.',
  },
  removeOptionDescription: {
    id: 'protocolBuilder.option.removeOptionDescription',
    defaultMessage: 'Are you sure you want to remove this option?',
    description:
      'Body of the confirmation raised when a researcher deletes one option from the list.',
  },
  reorderOption: {
    id: 'protocolBuilder.option.reorderOption',
    defaultMessage: 'Reorder option {position} of {count, number}',
    description:
      'Accessible name of the handle that drags one option into a different position. position is the option’s own place in the list, counting from one; count is how many options the list holds.',
  },
  editOption: {
    id: 'protocolBuilder.option.editOption',
    defaultMessage: 'Edit option {position}',
    description:
      'Accessible name of the button that opens one option for editing. position is the option’s own place in the list, counting from one — the only thing that tells two blank options apart.',
  },
  removeOptionAt: {
    id: 'protocolBuilder.option.removeOptionAt',
    defaultMessage: 'Remove option {position}',
    description:
      'Accessible name of the button that deletes one option. position is the option’s own place in the list, counting from one — the only thing that tells two blank options apart.',
  },
  finishEditing: {
    id: 'protocolBuilder.option.finishEditing',
    defaultMessage: 'Finish editing option',
    description:
      'Accessible name of the button that collapses an option back to a single line once the researcher has filled it in.',
  },
  untitled: {
    id: 'protocolBuilder.option.untitled',
    defaultMessage: 'Untitled option',
    description:
      'Stands in for an option’s label on the collapsed row while the researcher has not written one yet.',
  },
  noValue: {
    id: 'protocolBuilder.option.noValue',
    defaultMessage: 'No value',
    description:
      'Stands in for an option’s stored value on the collapsed row while the researcher has not entered one yet.',
  },
  labelLabel: {
    id: 'protocolBuilder.option.labelLabel',
    defaultMessage: 'Label',
    description:
      'Label of the field holding what a participant reads for this option.',
  },
  labelPlaceholder: {
    id: 'protocolBuilder.option.labelPlaceholder',
    defaultMessage: 'Enter a label...',
    description:
      'Placeholder in the empty field holding what a participant reads for this option.',
  },
  valueLabel: {
    id: 'protocolBuilder.option.valueLabel',
    defaultMessage: 'Value',
    description:
      'Label of the field holding what this option is stored and exported as, as opposed to what a participant reads.',
  },
  valuePlaceholder: {
    id: 'protocolBuilder.option.valuePlaceholder',
    defaultMessage: 'Enter a value...',
    description:
      'Placeholder in the empty field holding what this option is stored and exported as.',
  },
});

export type OptionValue = VariableOptions[number];

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoRichTextEditorField = RichTextEditorField as ComponentType<
  Record<string, unknown>
>;

const LABEL_VALIDATORS = [requiredRow(), uniqueRowAttribute()] as const;
const VALUE_VALIDATORS = [
  requiredRow(),
  uniqueRowAttribute(),
  allowedVariableNameRow('option value'),
] as const;

const isNumberLike = (value: string) =>
  Number.parseInt(value, 10).toString() === value;

/**
 * A numeric-looking option value is stored as a number, matching the protocol
 * schema.
 */
const parseOptionValue = (value: string) => {
  const canonical = toCanonicalText(value);
  return isNumberLike(canonical) ? toNumber(canonical) : canonical;
};

// Background and rounding live on the ArrayField item Surface (see Options.tsx
// itemClasses); this inner wrapper only owns layout + the error-state border.
const ROW_CLASSES =
  'w-full border-2 border-transparent p-5 transition-colors duration-300 ease-in-out';

export type OptionsContextValue = {
  /** Resolved name of the array field these rows belong to. */
  arrayName: string;
  /** The whole array, for cross-row validators. */
  allValues: Record<string, unknown>;
  /** The array field itself is reporting an error (minTwoOptions et al). */
  showArrayError: boolean;
};

export const OptionsContext = createContext<OptionsContextValue | null>(null);

const useOptionsContext = () => {
  const context = useContext(OptionsContext);
  if (!context) {
    throw new Error('Option rows must be rendered inside Options.');
  }
  return context;
};

const RICH_TEXT_TOOLBAR = {
  headings: false,
  history: true,
  links: false,
  lists: false,
  thematicBreak: false,
};

/**
 * One label/value option, edited in place.
 *
 * Rows here are always visible and open into an inline editor rather than a
 * dialog: an option is two short fields, and a list of them is read as a whole.
 */
export default function Option({
  item,
  index,
  committedIndex,
  itemCount,
  isSortable,
  dragControls,
  onMove,
  onDelete,
  onEdit,
  onCancel,
  onUpdate,
  isBeingEdited,
  disabled,
  readOnly,
  getAddTrigger,
}: ArrayFieldItemProps<OptionValue>) {
  const intl = useAppIntl();
  const { arrayName, allValues, showArrayError } = useOptionsContext();
  const { rowRef, confirmRemoval } = useConfirmRowRemoval({
    item,
    itemLabel: optionNoun,
    index,
    onDelete,
    getAddTrigger,
  });
  const interactionDisabled = disabled || readOnly;
  const rowFieldName = `${arrayName}[${committedIndex ?? index}]`;

  // Refusing to collapse an incomplete row has to reveal why, before the row
  // has necessarily been edited.
  const [forceShowErrors, setForceShowErrors] = useState(false);

  // immediateAdd (see Options.tsx) commits a new option straight into the
  // array via ArrayField's addItem, which never marks it as "being edited" —
  // that only happens through onEdit/startEditing. Enter edit mode ourselves
  // the first time this row mounts still blank, so a freshly added option
  // opens directly into the inline editor instead of an empty summary line.
  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (hasAutoOpenedRef.current || isBeingEdited) return;
    if (item.label || !isOptionValueEmpty(item.value)) return;
    hasAutoOpenedRef.current = true;
    onEdit?.();
  }, [isBeingEdited, item.label, item.value, onEdit]);

  const labelContent = useMemo(
    () =>
      markdownToRichTextContent(
        typeof item.label === 'string' ? item.label : '',
        true,
      ),
    [item.label],
  );

  const handleFinishEditing = () => {
    if (!isOptionComplete(item)) {
      setForceShowErrors(true);
      return;
    }

    onCancel();
  };

  const handleDelete = () => {
    confirmRemoval({
      title: messages.removeOption,
      description: messages.removeOptionDescription,
      confirmLabel: messages.removeOption,
    });
  };

  if (!isBeingEdited) {
    const hasLabel = !isOptionLabelEmpty(item.label);
    const hasValue = !isOptionValueEmpty(item.value);

    return (
      <div
        ref={rowRef}
        className={cx(
          'flex items-center gap-3',
          ROW_CLASSES,
          showArrayError && 'border-destructive',
        )}
      >
        {isSortable && (
          <ArrayFieldDragHandle
            dragControls={dragControls}
            index={index}
            itemCount={itemCount}
            onMove={onMove}
            disabled={interactionDisabled}
            label={intl.formatMessage(messages.reorderOption, {
              position: index + 1,
              count: itemCount,
            })}
          />
        )}
        <div className="min-w-0 flex-1 truncate">
          <span className={!hasLabel ? 'text-current/50 italic' : undefined}>
            {hasLabel ? item.label : intl.formatMessage(messages.untitled)}
          </span>
          <span className="text-current/50"> — </span>
          <span
            className={cx(
              'font-monospace',
              !hasValue && 'text-current/50 italic',
            )}
          >
            {hasValue
              ? String(item.value)
              : intl.formatMessage(messages.noValue)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            icon={<Pencil />}
            aria-label={intl.formatMessage(messages.editOption, {
              position: index + 1,
            })}
            color="dynamic"
            disabled={interactionDisabled}
            onClick={onEdit}
          />
          <IconButton
            {...rowRemovalControlProps}
            icon={<Trash2 />}
            aria-label={intl.formatMessage(messages.removeOptionAt, {
              position: index + 1,
            })}
            color="destructive"
            disabled={interactionDisabled}
            onClick={handleDelete}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={cx(
        'flex flex-col gap-4',
        ROW_CLASSES,
        showArrayError && 'border-destructive',
      )}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        handleFinishEditing();
      }}
    >
      <div className="flex items-center justify-end gap-2">
        <IconButton
          icon={<Check />}
          aria-label={intl.formatMessage(messages.finishEditing)}
          size="lg"
          color="primary"
          disabled={interactionDisabled}
          onClick={handleFinishEditing}
        />
        <IconButton
          {...rowRemovalControlProps}
          icon={<Trash2 />}
          aria-label={intl.formatMessage(messages.removeOptionAt, {
            position: index + 1,
          })}
          color="destructive"
          disabled={interactionDisabled}
          onClick={handleDelete}
        />
      </div>
      <RowField
        name={`${rowFieldName}.label`}
        label={intl.formatMessage(messages.labelLabel)}
        component={FrescoRichTextEditorField}
        placeholder={intl.formatMessage(messages.labelPlaceholder)}
        changeMode="input"
        toolbarOptions={RICH_TEXT_TOOLBAR}
        value={labelContent}
        onChange={(value: unknown) => {
          // Stored canonically so two labels that read identically are also
          // identical bytes on export — see shared-consts' `canonical-text`.
          const label = toCanonicalText(
            richTextContentToMarkdown(
              value as RichTextContent | undefined,
              true,
            ),
          );
          // The editor emits a change as it mounts; committing that would
          // rewrite the whole array — dirtying the stage and adding a draft
          // timeline entry — merely by opening a row. The comparison is
          // canonical too, so opening a row whose stored label predates this
          // normalization is not mistaken for an edit.
          if (label === toCanonicalText(item.label ?? '')) return;
          onUpdate?.({ label } as Partial<OptionValue>);
        }}
        validators={LABEL_VALIDATORS}
        allValues={allValues}
        forceShowErrors={forceShowErrors}
        disabled={interactionDisabled}
      />
      <RowField
        name={`${rowFieldName}.value`}
        label={intl.formatMessage(messages.valueLabel)}
        component={FrescoInputField}
        placeholder={intl.formatMessage(messages.valuePlaceholder)}
        value={item.value}
        onChange={(value: unknown) =>
          onUpdate?.({
            value: parseOptionValue(
              typeof value === 'string' || typeof value === 'number'
                ? String(value)
                : '',
            ),
          } as Partial<OptionValue>)
        }
        validators={VALUE_VALIDATORS}
        allValues={allValues}
        forceShowErrors={forceShowErrors}
        disabled={interactionDisabled}
      />
    </div>
  );
}
