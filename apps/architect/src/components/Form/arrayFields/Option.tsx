import { toNumber } from 'es-toolkit/compat';
import { Check, Pencil, Trash2 } from 'lucide-react';
import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  ArrayFieldDragHandle,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';
import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
  type RichTextContent,
} from '@codaco/protocol-builder/markdown/markdownAdapter';
import type { VariableOptions } from '@codaco/protocol-validation';
import { toCanonicalText } from '@codaco/shared-consts';
import {
  isOptionComplete,
  isOptionLabelEmpty,
  isOptionValueEmpty,
} from '~/components/Options/optionCompleteness';
import { cx } from '~/utils/cva';

import RowField from './RowField';
// Punctuation only, separating two unchanged researcher-authored values.
const OPTION_VALUE_SEPARATOR = ' — ';
const messages = defineMessages({
  optionValue: {
    id: 'architect.form.arrayFields.option.optionValue',
    defaultMessage: 'option value',
    description: 'Subject of the invalid option-value identifier guidance.',
  },
  removeOption: {
    id: 'architect.form.arrayFields.option.removeOption',
    defaultMessage: 'Remove option',
    description: 'The title text in components / Form / arrayFields / Option.',
  },
  areYouSureYouWantTo: {
    id: 'architect.form.arrayFields.option.areYouSureYouWantTo',
    defaultMessage: 'Are you sure you want to remove this option?',
    description:
      'The description text in components / Form / arrayFields / Option.',
  },
  reorderOptionOf: {
    id: 'architect.form.arrayFields.option.reorderOptionOf',
    defaultMessage: 'Reorder option {value1, number} of {itemCount, number}',
    description: 'The label text in components / Form / arrayFields / Option.',
  },
  untitledOption: {
    id: 'architect.form.arrayFields.option.untitledOption',
    defaultMessage: 'Untitled option',
    description: 'Visible text in components / Form / arrayFields / Option.',
  },
  noValue: {
    id: 'architect.form.arrayFields.option.noValue',
    defaultMessage: 'No value',
    description: 'Visible text in components / Form / arrayFields / Option.',
  },
  editOption: {
    id: 'architect.form.arrayFields.option.editOption',
    defaultMessage: 'Edit option {value1}',
    description:
      'The aria-label text in components / Form / arrayFields / Option.',
  },
  removeOption45a9b: {
    id: 'architect.form.arrayFields.option.removeOption45a9b',
    defaultMessage: 'Remove option {value1}',
    description:
      'The aria-label text in components / Form / arrayFields / Option.',
  },
  finishEditingOption: {
    id: 'architect.form.arrayFields.option.finishEditingOption',
    defaultMessage: 'Finish editing option',
    description:
      'The aria-label text in components / Form / arrayFields / Option.',
  },
  label: {
    id: 'architect.form.arrayFields.option.label',
    defaultMessage: 'Label',
    description: 'The label text in components / Form / arrayFields / Option.',
  },
  enterALabel: {
    id: 'architect.form.arrayFields.option.enterALabel',
    defaultMessage: 'Enter a label...',
    description:
      'The placeholder text in components / Form / arrayFields / Option.',
  },
  value: {
    id: 'architect.form.arrayFields.option.value',
    defaultMessage: 'Value',
    description: 'The label text in components / Form / arrayFields / Option.',
  },
  enterAValue: {
    id: 'architect.form.arrayFields.option.enterAValue',
    defaultMessage: 'Enter a value...',
    description:
      'The placeholder text in components / Form / arrayFields / Option.',
  },
});

export type OptionValue = VariableOptions[number];

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoRichTextEditorField = RichTextEditorField as ComponentType<
  Record<string, unknown>
>;

const isNumberLike = (value: string) =>
  Number.parseInt(value, 10).toString() === value;

/**
 * A numeric-looking option value is stored as a number, matching the protocol
 * schema.
 */
export const parseOptionValue = (value: string) => {
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

const Option = ({
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
}: ArrayFieldItemProps<OptionValue>) => {
  const intl = useAppIntl();
  const { arrayName, allValues, showArrayError } = useOptionsContext();
  const { confirm } = useDialog();
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
    void confirm({
      title: createElement(AppMessage, { message: messages.removeOption }),
      description: createElement(AppMessage, {
        message: messages.areYouSureYouWantTo,
      }),
      confirmLabel: createElement(AppMessage, {
        message: messages.removeOption,
      }),
      cancelLabel: createElement(AppMessage, {
        message: commonMessages.cancel,
      }),
      intent: 'destructive',
      onConfirm: () => onDelete?.(),
    });
  };

  if (!isBeingEdited) {
    const hasLabel = !isOptionLabelEmpty(item.label);
    const hasValue = !isOptionValueEmpty(item.value);

    return (
      <div
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
            label={intl.formatMessage(messages.reorderOptionOf, {
              value1: index + 1,
              itemCount: itemCount,
            })}
          />
        )}
        <div className="min-w-0 flex-1 truncate">
          <span className={!hasLabel ? 'text-current/50 italic' : undefined}>
            {hasLabel
              ? item.label
              : intl.formatMessage(messages.untitledOption)}
          </span>
          {/* Decorative separation of authored label and value. */}
          <span className="text-current/50" aria-hidden>
            {OPTION_VALUE_SEPARATOR}
          </span>
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
              value1: index + 1,
            })}
            color="dynamic"
            disabled={interactionDisabled}
            onClick={onEdit}
          />
          <IconButton
            icon={<Trash2 />}
            aria-label={intl.formatMessage(messages.removeOption45a9b, {
              value1: index + 1,
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
          aria-label={intl.formatMessage(messages.finishEditingOption)}
          size="lg"
          color="primary"
          disabled={interactionDisabled}
          onClick={handleFinishEditing}
        />
        <IconButton
          icon={<Trash2 />}
          aria-label={intl.formatMessage(messages.removeOption45a9b, {
            value1: index + 1,
          })}
          color="destructive"
          disabled={interactionDisabled}
          onClick={handleDelete}
        />
      </div>
      <RowField
        name={`${rowFieldName}.label`}
        label={intl.formatMessage(messages.label)}
        component={FrescoRichTextEditorField}
        placeholder={intl.formatMessage(messages.enterALabel)}
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
        validation={{ required: true, uniqueArrayAttribute: true }}
        allValues={allValues}
        forceShowErrors={forceShowErrors}
        disabled={interactionDisabled}
      />
      <RowField
        name={`${rowFieldName}.value`}
        label={intl.formatMessage(messages.value)}
        component={FrescoInputField}
        placeholder={intl.formatMessage(messages.enterAValue)}
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
        validation={{
          required: true,
          uniqueArrayAttribute: true,
          allowedVariableName: intl.formatMessage(messages.optionValue),
        }}
        allValues={allValues}
        forceShowErrors={forceShowErrors}
        disabled={interactionDisabled}
      />
    </div>
  );
};

export default Option;
