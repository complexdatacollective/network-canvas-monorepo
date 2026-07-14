import { toNumber } from 'es-toolkit/compat';
import { Check, Pencil, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useRef } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type { FrescoReduxArrayFieldItemProps } from '~/components/Form/FrescoReduxArrayField';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import { cx } from '~/utils/cva';
import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
  type RichTextContent,
} from '~/utils/markdownAdapter';

import type { OptionValue } from './Options';
const isNumberLike = (value: string) =>
  Number.parseInt(value, 10).toString() === value; // eslint-disable-line

export const parseOptionValue = (value: string) =>
  isNumberLike(value) ? toNumber(value) : value;

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;
const FrescoRichTextEditorField = RichTextEditorField as ComponentType<
  Record<string, unknown>
>;
const optionLabelFromRedux = (value: unknown) =>
  markdownToRichTextContent(typeof value === 'string' ? value : '', true);
const optionLabelToRedux = (value: unknown) =>
  richTextContentToMarkdown(value as RichTextContent | undefined, true);

const isValueEmpty = (value: unknown) =>
  value === undefined || value === null || value === '';

// Background and rounding live on the ArrayField item Surface (see Options.tsx
// itemClasses); this inner wrapper only owns layout + the error-state border.
const ROW_CLASSES =
  'w-full border-2 border-transparent p-5 transition-colors duration-300 ease-in-out';

type OptionProps = FrescoReduxArrayFieldItemProps<OptionValue>;

const Option = ({
  item,
  fieldName,
  index,
  itemCount,
  isSortable,
  dragControls,
  onMove,
  onDelete,
  onEdit,
  onCancel,
  isBeingEdited,
  disabled,
  readOnly,
  showErrors,
}: OptionProps) => {
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;

  // immediateAdd (see Options.tsx) commits a new option straight into the
  // array via ArrayField's addItem, which never marks it as "being edited" —
  // that only happens through onEdit/startEditing. Enter edit mode ourselves
  // the first time this row mounts still blank, so a freshly added option
  // opens directly into the inline editor instead of an empty summary line.
  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (hasAutoOpenedRef.current || isBeingEdited) return;
    if (item.label || !isValueEmpty(item.value)) return;
    hasAutoOpenedRef.current = true;
    onEdit();
  }, [isBeingEdited, item.label, item.value, onEdit]);

  const handleDelete = () => {
    void confirm({
      title: 'Remove option',
      description: 'Are you sure you want to remove this option?',
      confirmLabel: 'Remove option',
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: onDelete,
    });
  };

  if (!isBeingEdited) {
    const hasLabel = typeof item.label === 'string' && item.label.length > 0;
    const hasValue = !isValueEmpty(item.value);

    return (
      <div
        className={cx(
          'flex items-center gap-3',
          ROW_CLASSES,
          showErrors && 'border-destructive',
        )}
      >
        {isSortable && (
          <ArrayFieldDragHandle
            dragControls={dragControls}
            index={index}
            itemCount={itemCount}
            onMove={onMove}
            disabled={interactionDisabled}
            label={`Reorder option ${index + 1} of ${itemCount}`}
            size="lg"
          />
        )}
        <div className="min-w-0 flex-1 truncate">
          <span className={!hasLabel ? 'text-current/50 italic' : undefined}>
            {hasLabel ? item.label : 'Untitled option'}
          </span>
          <span className="text-current/50"> — </span>
          <span
            className={cx(
              'font-monospace',
              !hasValue && 'text-current/50 italic',
            )}
          >
            {hasValue ? String(item.value) : 'No value'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            icon={<Pencil />}
            aria-label={`Edit option ${index + 1}`}
            size="lg"
            color="dynamic"
            disabled={interactionDisabled}
            onClick={onEdit}
          />
          <IconButton
            icon={<Trash2 />}
            aria-label={`Remove option ${index + 1}`}
            size="lg"
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
        showErrors && 'border-destructive',
      )}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="flex items-center justify-end gap-2">
        <IconButton
          icon={<Check />}
          aria-label="Finish editing option"
          size="lg"
          color="primary"
          disabled={interactionDisabled}
          onClick={onCancel}
        />
        <IconButton
          icon={<Trash2 />}
          aria-label={`Remove option ${index + 1}`}
          size="lg"
          color="destructive"
          disabled={interactionDisabled}
          onClick={handleDelete}
        />
      </div>
      <ValidatedField
        component={FrescoReduxField}
        componentProps={{
          fieldComponent: FrescoRichTextEditorField,
          label: 'Label',
          placeholder: 'Enter a label...',
          changeMode: 'input',
          toolbarOptions: {
            headings: false,
            history: true,
            links: false,
            lists: false,
            thematicBreak: false,
          },
          fromReduxValue: optionLabelFromRedux,
          toReduxValue: optionLabelToRedux,
        }}
        name={`${fieldName}.label`}
        validation={{ required: true, uniqueArrayAttribute: true }}
      />
      <ValidatedField
        component={FrescoReduxField}
        componentProps={{
          fieldComponent: FrescoInputField,
          label: 'Value',
          placeholder: 'Enter a value...',
          toReduxValue: parseOptionValue,
        }}
        name={`${fieldName}.value`}
        validation={{
          required: true,
          uniqueArrayAttribute: true,
          allowedVariableName: 'option value',
        }}
      />
    </div>
  );
};
export default Option;
