import { toNumber } from 'es-toolkit/compat';
import { Trash2 } from 'lucide-react';
import type React from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import RichTextField from '~/components/Form/Fields/RichText';
import TextField from '~/components/Form/Fields/Text';
import type { FrescoReduxArrayFieldItemProps } from '~/components/Form/FrescoReduxArrayField';
import ValidatedField from '~/components/Form/ValidatedField';
import { cx } from '~/utils/cva';

import type { OptionValue } from './Options';
const isNumberLike = (value: string) =>
  Number.parseInt(value, 10).toString() === value; // eslint-disable-line

export const parseOptionValue = (value: string) =>
  isNumberLike(value) ? toNumber(value) : value;

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
  showErrors,
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
    <div
      className={cx(
        'text-sortable-contrast z-1 flex w-full rounded-xl transition-colors duration-300 ease-in-out',
        showErrors ? 'bg-destructive' : 'bg-form-control',
      )}
    >
      {isSortable && (
        <div className="flex grow-0 items-center p-5">
          <ArrayFieldDragHandle
            dragControls={dragControls}
            index={index}
            itemCount={itemCount}
            onMove={onMove}
            disabled={interactionDisabled}
            label={`Reorder option ${index + 1} of ${itemCount}`}
            className="text-sortable-contrast"
          />
        </div>
      )}
      <div className="flex flex-1">
        <div className="my-5 flex-1">
          <Heading
            level="h4"
            className={cx(
              'mx-0 mt-0 mb-5 transition-colors duration-300 ease-in-out',
              showErrors && 'text-primary-contrast',
            )}
          >
            Label
          </Heading>
          <ValidatedField<{
            inline?: boolean;
            placeholder?: string;
          }>
            component={
              RichTextField as React.ComponentType<Record<string, unknown>>
            }
            componentProps={{
              inline: true,
              placeholder: 'Enter a label...',
            }}
            name={`${fieldName}.label`}
            validation={{ required: true, uniqueArrayAttribute: true }}
          />
        </div>
        <div className="my-5 ml-5 flex-1">
          <Heading
            level="h4"
            className={cx(
              'mx-0 mt-0 mb-5 transition-colors duration-300 ease-in-out',
              showErrors && 'text-primary-contrast',
            )}
          >
            Value
          </Heading>
          <ValidatedField<{
            parse?: (value: string) => string | number;
            placeholder?: string;
          }>
            component={
              TextField as React.ComponentType<Record<string, unknown>>
            }
            componentProps={{
              parse: parseOptionValue,
              placeholder: 'Enter a value...',
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
      <div className="flex grow-0 p-5">
        <IconButton
          icon={<Trash2 />}
          aria-label="Remove option"
          size="sm"
          variant="text"
          color="destructive"
          disabled={interactionDisabled}
          onClick={handleDelete}
        />
      </div>
    </div>
  );
};
export default Option;
