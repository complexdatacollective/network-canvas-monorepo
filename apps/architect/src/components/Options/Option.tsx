import { toNumber } from 'es-toolkit/compat';
import { Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type { FrescoReduxArrayFieldItemProps } from '~/components/Form/FrescoReduxArrayField';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
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

type OptionProps = FrescoReduxArrayFieldItemProps<OptionValue>;

const Option = ({
  fieldName,
  index,
  itemCount,
  isSortable,
  dragControls,
  onMove,
  onDelete,
  disabled,
  readOnly,
}: OptionProps) => {
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;
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

  return (
    <div className="flex w-full items-center gap-4">
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={interactionDisabled}
          label={`Reorder option ${index + 1} of ${itemCount}`}
          size="md"
          className="shrink-0"
        />
      )}
      <div className="flex min-w-0 flex-1 gap-4">
        <div className="min-w-0 flex-1">
          <ValidatedField
            component={FrescoReduxField}
            componentProps={{
              fieldComponent: FrescoRichTextEditorField,
              label: 'Label',
              placeholder: 'Enter a label...',
              changeMode: 'input',
              compact: true,
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
        </div>
        <div className="min-w-0 flex-1">
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
      </div>
      <IconButton
        icon={<Trash2 />}
        aria-label="Remove option"
        size="md"
        variant="text"
        color="destructive"
        disabled={interactionDisabled}
        onClick={handleDelete}
        className="hover:enabled:bg-destructive hover:enabled:text-destructive-contrast shrink-0 text-current"
      />
    </div>
  );
};
export default Option;
