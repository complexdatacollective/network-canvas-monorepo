import { toNumber } from 'es-toolkit/compat';
import { GripVertical, Trash2 } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import type React from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import RichTextField from '~/components/Form/Fields/RichText';
import TextField from '~/components/Form/Fields/Text';
import ValidatedField from '~/components/Form/ValidatedField';
import { cx } from '~/utils/cva';

import type { OptionValue } from './Options';

const isNumberLike = (value: string) =>
  Number.parseInt(value, 10).toString() === value; // eslint-disable-line

type InternalItem<T> = {
  _internalId: string;
  data: T;
};

// Layout for the side controls (drag handle + delete button). Both are 3rem wide
// flex centers; the only difference is `cursor: grab` for the handle.
const sideControlClasses =
  'flex w-14 cursor-pointer items-center justify-center bg-transparent text-sortable-contrast [&_.icon]:size-5';

const DeleteOption = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={sideControlClasses}
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
  >
    <Trash2 aria-hidden />
  </div>
);

// Props passed from parent
type OptionBaseProps = {
  field: string;
  internalItem: InternalItem<OptionValue>;
  index: number;
  fields: {
    remove: (index: number) => void;
  };
  hasError?: boolean;
};

const Option = ({
  field,
  internalItem,
  index,
  fields,
  hasError = false,
}: OptionBaseProps) => {
  const controls = useDragControls();
  const { confirm } = useDialog();

  const handleDelete = () => {
    void confirm({
      title: 'Remove option',
      description: 'Are you sure you want to remove this option?',
      confirmLabel: 'Remove option',
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: () => {
        fields.remove(index);
      },
    });
  };

  return (
    <Reorder.Item
      className={cx(
        'text-sortable-contrast z-1 flex rounded-xl transition-colors duration-300 ease-in-out',
        hasError ? 'bg-destructive' : 'bg-form-control',
      )}
      value={internalItem}
      dragListener={false}
      dragControls={controls}
    >
      <div className="flex grow-0 items-center p-5">
        <div
          className={cx(sideControlClasses, 'cursor-grab')}
          onPointerDown={(e) => controls.start(e)}
        >
          <GripVertical className="cursor-grab" />
        </div>
      </div>
      <div className="flex flex-1">
        <div className="my-5 flex-1">
          <h4
            className={cx(
              'mx-0 mt-0 mb-5 transition-colors duration-300 ease-in-out',
              hasError && 'text-primary-contrast',
            )}
          >
            Label
          </h4>
          <ValidatedField<{ inline?: boolean; placeholder?: string }>
            component={
              RichTextField as React.ComponentType<Record<string, unknown>>
            }
            componentProps={{
              inline: true,
              placeholder: 'Enter a label...',
            }}
            name={`${field}.label`}
            validation={{ required: true, uniqueArrayAttribute: true }}
          />
        </div>
        <div className="my-5 ml-5 flex-1">
          <h4
            className={cx(
              'mx-0 mt-0 mb-5 transition-colors duration-300 ease-in-out',
              hasError && 'text-primary-contrast',
            )}
          >
            Value
          </h4>
          <ValidatedField<{
            parse?: (value: string) => string | number;
            placeholder?: string;
          }>
            component={
              TextField as React.ComponentType<Record<string, unknown>>
            }
            componentProps={{
              parse: (value: string) =>
                isNumberLike(value) ? toNumber(value) : value,
              placeholder: 'Enter a value...',
            }}
            name={`${field}.value`}
            validation={{
              required: true,
              uniqueArrayAttribute: true,
              allowedVariableName: 'option value',
            }}
          />
        </div>
      </div>
      <div className="flex grow-0 p-5">
        <DeleteOption onClick={handleDelete} />
      </div>
    </Reorder.Item>
  );
};

export default Option;
