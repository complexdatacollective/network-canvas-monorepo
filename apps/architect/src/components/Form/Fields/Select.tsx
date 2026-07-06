import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  className?: string;
  options?: SelectOption[];
  input?: {
    name?: string;
    value?: string | null;
    onChange?: (value: string) => void;
    onBlur?: (value: string | null) => void;
  };
  meta?: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
  label?: string | null;
  placeholder?: string;
  isDisabled?: boolean;
};

const Select = ({
  className,
  options = [],
  input,
  meta = {},
  label = null,
  placeholder = 'Select an option',
  isDisabled = false,
}: SelectProps) => {
  const reactId = useId();
  const currentValue = input?.value ?? null;

  // Track the latest selected value so onBlur fired by handleOpenChange
  // sees the value committed by handleValueChange in the same event, not
  // the stale render-time value.
  const latestValueRef = useRef<string | null>(currentValue);
  useEffect(() => {
    latestValueRef.current = currentValue;
  }, [currentValue]);

  if (!input) return null;

  const { value, onChange, onBlur, name } = input;
  const { invalid, error, touched } = meta;
  const hasError = !!(invalid && touched && error);

  const labelId = label ? `${reactId}-label` : undefined;
  const errorId = hasError ? `${reactId}-error` : undefined;

  const handleValueChange = (next: string | null) => {
    if (next === null) return;
    latestValueRef.current = next;
    onChange?.(next);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onBlur?.(latestValueRef.current);
    }
  };

  return (
    <div className={cx('flex flex-col', className)}>
      {label && <h4 id={labelId}>{label}</h4>}
      <BaseSelect.Root
        value={value ?? null}
        onValueChange={handleValueChange}
        onOpenChange={handleOpenChange}
        disabled={isDisabled}
        name={name}
        items={options}
      >
        <BaseSelect.Trigger
          aria-labelledby={labelId}
          aria-describedby={errorId}
          className={cx(
            'bg-surface-1 text-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-left text-base',
            'data-disabled:cursor-not-allowed data-disabled:opacity-60',
            hasError
              ? 'border-error rounded-b-none border-2'
              : 'border-surface-2',
          )}
        >
          <BaseSelect.Value className="min-w-0 flex-1 truncate">
            {(selectedValue: string | null) => {
              if (
                selectedValue === null ||
                selectedValue === undefined ||
                selectedValue === ''
              ) {
                return (
                  <span className="text-surface-2-foreground italic">
                    {placeholder}
                  </span>
                );
              }
              const option = options.find((o) => o.value === selectedValue);
              return option?.label ?? selectedValue;
            }}
          </BaseSelect.Value>
          <BaseSelect.Icon className="shrink-0">
            <ChevronDown size={16} className="text-surface-2-foreground" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner
            align="start"
            sideOffset={4}
            alignItemWithTrigger={false}
            className="z-(--z-tooltip)"
          >
            <BaseSelect.Popup className="border-surface-2 bg-surface-1 w-(--anchor-width) min-w-(--anchor-width) overflow-hidden rounded border shadow-md">
              <BaseSelect.List className="max-h-72 overflow-y-auto p-1">
                {options.map((option) => (
                  <BaseSelect.Item
                    key={option.value}
                    value={option.value}
                    className="text-foreground data-highlighted:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-base outline-none"
                  >
                    <BaseSelect.ItemText className="min-w-0 flex-1">
                      {option.label}
                    </BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator className="text-foreground shrink-0">
                      <Check size={16} />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
      {hasError && (
        <div
          id={errorId}
          className="bg-error text-error-foreground flex items-center rounded-b-sm px-(--space-xs) py-(--space-sm) [&_svg]:max-h-(--space-md)"
        >
          <Icon name="warning" />
          {error}
        </div>
      )}
    </div>
  );
};

export default Select;
