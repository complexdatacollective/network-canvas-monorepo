'use client';

import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronsUpDown, SearchIcon } from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useMemo,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Button from '../../../Button';
import Surface from '../../../layout/Surface';
import { usePortalContainer } from '../../../PortalContainer';
import { ScrollArea } from '../../../ScrollArea';
import {
  dropdownItemVariants,
  proportionalLucideIconVariants,
} from '../../../styles/controlVariants';
import { cx, type VariantProps } from '../../../utils/cva';
import type { FieldValueProps, InjectedFieldProps } from '../../Field/types';
import { getInputState } from '../../utils/getInputState';
import InputField from '../InputField';
import { type ComboboxOption, comboboxTriggerVariants } from './shared';

const messages = defineMessages({
  placeholder: {
    id: 'frescoUi.combobox.placeholder',
    defaultMessage: 'Select items...',
    description: 'Default placeholder of the multi-select combobox trigger.',
  },
  searchPlaceholder: {
    id: 'frescoUi.combobox.searchPlaceholder',
    defaultMessage: 'Search...',
    description:
      'Default placeholder of the search input inside the combobox popup.',
  },
  noItems: {
    id: 'frescoUi.combobox.noItems',
    defaultMessage: 'No items found.',
    description:
      'Default empty state shown when the combobox search matches nothing.',
  },
  allSelected: {
    id: 'frescoUi.combobox.allSelected',
    defaultMessage: 'All {plural} selected ({count, number})',
    description:
      'Trigger label when every option is selected; {plural} is the host-supplied plural noun (e.g. "items").',
  },
  someSelected: {
    id: 'frescoUi.combobox.someSelected',
    defaultMessage:
      '{count, plural, one {# {singular} selected} other {# {plural} selected}}',
    description:
      'Trigger label summarising the selection; {singular} and {plural} are host-supplied noun forms (e.g. "item"/"items").',
  },
  defaultSingular: {
    id: 'frescoUi.combobox.defaultSingular',
    defaultMessage: 'item',
    description:
      'Default singular noun interpolated into the combobox selection summary.',
  },
  defaultPlural: {
    id: 'frescoUi.combobox.defaultPlural',
    defaultMessage: 'items',
    description:
      'Default plural noun interpolated into the combobox selection summary.',
  },
  selectAll: {
    id: 'frescoUi.combobox.selectAll',
    defaultMessage: 'Select All',
    description: 'Button selecting every enabled combobox option.',
  },
  deselectAll: {
    id: 'frescoUi.combobox.deselectAll',
    defaultMessage: 'Deselect All',
    description: 'Button clearing the combobox selection.',
  },
});

type ComboboxFieldProps = FieldValueProps<(string | number)[]> &
  InjectedFieldProps & {
    options: ComboboxOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    showSearch?: boolean;
    showSelectAll?: boolean;
    showDeselectAll?: boolean;
    singular?: string;
    plural?: string;
    renderOption?: (option: ComboboxOption) => ReactNode;
    renderValue?: (selectedOptions: ComboboxOption[]) => ReactNode;
    className?: string;
  } & Omit<
    ComponentPropsWithoutRef<typeof Combobox.Root>,
    | 'onValueChange'
    | 'multiple'
    | 'value'
    | 'defaultValue'
    | 'name'
    | 'disabled'
  > &
  VariantProps<typeof comboboxTriggerVariants>;

// Stable empty selection, so a value of the wrong shape doesn't re-run the
// memos below on every render.
const EMPTY_SELECTION: (string | number)[] = [];

function isComboboxOption(value: unknown): value is ComboboxOption {
  if (typeof value !== 'object' || value === null) return false;

  return (
    'value' in value &&
    (typeof value.value === 'string' || typeof value.value === 'number') &&
    'label' in value &&
    typeof value.label === 'string'
  );
}

function ComboboxField(props: ComboboxFieldProps) {
  const intl = useAppIntl();
  const {
    options,
    placeholder = intl.formatMessage(messages.placeholder),
    searchPlaceholder = intl.formatMessage(messages.searchPlaceholder),
    emptyMessage = intl.formatMessage(messages.noItems),
    showSearch = true,
    showSelectAll = true,
    showDeselectAll = true,
    singular = intl.formatMessage(messages.defaultSingular),
    plural = intl.formatMessage(messages.defaultPlural),
    renderOption,
    renderValue,
    size,
    className,
    onChange,
    value = EMPTY_SELECTION,
    name,
    disabled,
    readOnly,
    onBlur,
    onFocus,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    'aria-disabled': ariaDisabled,
    'aria-readonly': ariaReadOnly,
    ...rest
  } = props;

  // Workaround until base-ui ships `keepFilterText` (mui/base-ui#4360).
  // The recommended pattern from mui/base-ui#3977 is to control `inputValue`
  // and only honour `input-change`, so base-ui's internal `input-clear` on
  // item press doesn't wipe the user's search query.
  const [inputValue, setInputValue] = useState('');

  const portalContainer = usePortalContainer();

  const handleValueChange = (
    newValue: unknown[] | null,
    _event: Combobox.Root.ChangeEventDetails,
  ) => {
    if (readOnly) return;
    if (newValue === null) {
      onChange?.([]);
    } else if (newValue.every(isComboboxOption)) {
      onChange?.(newValue.map((opt) => opt.value));
    }
  };

  const handleInputValueChange = (
    next: string | string[] | number | undefined,
    details: Combobox.Root.ChangeEventDetails,
  ) => {
    // Only react to user typing. base-ui fires `input-clear` itself when an
    // item is pressed in multi-select mode with the input inside the popup
    // (see AriaCombobox `handleSelection`), which would otherwise wipe the
    // search query the moment a user picks a result.
    if (details.reason !== 'input-change') {
      return;
    }
    setInputValue(typeof next === 'string' ? next : '');
  };

  const handleSelectAll = () => {
    if (readOnly) return;
    const enabledOptions = options.filter((opt) => !opt.disabled);
    onChange?.(enabledOptions.map((opt) => opt.value));
  };

  const handleDeselectAll = () => {
    if (readOnly) return;
    onChange?.([]);
  };

  // Rendering only: for one render the store can still hold the previous
  // field's value (see the render-tolerance contract on `useField`), and
  // anything but a list of chosen values renders as nothing selected.
  const selectedValues = useMemo(
    () => (Array.isArray(value) ? value : EMPTY_SELECTION),
    [value],
  );

  // Convert value array to selected options
  const selectedOptions = useMemo(() => {
    return options.filter((opt) => selectedValues.includes(opt.value));
  }, [options, selectedValues]);

  // Generate trigger label text
  const triggerLabel = useMemo(() => {
    if (selectedValues.length === 0) return null;
    if (selectedValues.length === options.length) {
      return intl.formatMessage(messages.allSelected, {
        plural,
        count: options.length,
      });
    }
    return intl.formatMessage(messages.someSelected, {
      count: selectedValues.length,
      singular,
      plural,
    });
  }, [selectedValues, options.length, singular, plural, intl]);

  const state = getInputState(props);

  return (
    <Combobox.Root
      {...rest}
      multiple
      items={options}
      value={selectedOptions}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={handleInputValueChange}
      onOpenChange={(open) => {
        if (!open) setInputValue('');
      }}
      disabled={Boolean(disabled) || Boolean(readOnly)}
      name={name}
    >
      <Combobox.Trigger
        onBlur={onBlur}
        onFocus={onFocus}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={ariaRequired}
        aria-disabled={ariaDisabled || disabled || undefined}
        aria-readonly={ariaReadOnly || readOnly || undefined}
        className={comboboxTriggerVariants({
          size,
          className: cx('w-full', className),
          state,
        })}
      >
        <span className="flex-1 truncate text-start">
          <Combobox.Value
            placeholder={
              <span className="text-input-contrast/50 italic">
                {placeholder}
              </span>
            }
          >
            {renderValue ? renderValue(selectedOptions) : triggerLabel}
          </Combobox.Value>
        </span>
        <Combobox.Icon className="shrink-0">
          <ChevronsUpDown className="h-[1.2em] w-[1.2em]" />
        </Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal container={portalContainer ?? undefined}>
        <Combobox.Positioner align="start" sideOffset={10}>
          <Combobox.Popup
            render={
              <Surface
                floating
                spacing="xs"
                shadow="lg"
                noContainer
                className={cx(
                  'flex flex-col',
                  'min-w-(--anchor-width)',
                  'gap-4',
                )}
              />
            }
          >
            {showSearch && (
              <Combobox.Input
                placeholder={searchPlaceholder}
                render={({ onChange: renderOnChange, ...renderProps }) => {
                  // base-ui's render prop types (HTMLProps) are structurally
                  // incompatible with InputField's types (e.g. value, onBlur,
                  // aria-required differ) but semantically correct at runtime.
                  const inputFieldProps =
                    renderProps as unknown as React.ComponentPropsWithRef<
                      typeof InputField
                    >;
                  return (
                    <InputField
                      {...inputFieldProps}
                      size="sm"
                      prefixComponent={<SearchIcon />}
                      className="w-full"
                      nativeOnChange={renderOnChange}
                    />
                  );
                }}
              />
            )}
            <Combobox.Empty className="text-center text-sm text-current/50 italic empty:hidden">
              {emptyMessage}
            </Combobox.Empty>
            <Combobox.List
              className="max-h-64 overflow-hidden has-data-empty:hidden"
              render={
                <ScrollArea viewportClassName="px-2 flex flex-col gap-1 " />
              }
            >
              {(option: ComboboxOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className={dropdownItemVariants()}
                >
                  <Combobox.ItemIndicator
                    className={cx(
                      proportionalLucideIconVariants(),
                      'flex size-4 items-center justify-center',
                    )}
                  >
                    <Check />
                  </Combobox.ItemIndicator>
                  {renderOption ? renderOption(option) : option.label}
                </Combobox.Item>
              )}
            </Combobox.List>
            {(showSelectAll || showDeselectAll) && (
              <div className="flex gap-2">
                {showSelectAll && (
                  <Button
                    onClick={handleSelectAll}
                    size="sm"
                    disabled={Boolean(disabled) || Boolean(readOnly)}
                  >
                    {intl.formatMessage(messages.selectAll)}
                  </Button>
                )}
                {showDeselectAll && (
                  <Button
                    onClick={handleDeselectAll}
                    size="sm"
                    disabled={Boolean(disabled) || Boolean(readOnly)}
                  >
                    {intl.formatMessage(messages.deselectAll)}
                  </Button>
                )}
              </div>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export default ComboboxField;
