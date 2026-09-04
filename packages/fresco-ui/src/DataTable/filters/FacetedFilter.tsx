'use client';

import { Combobox } from '@base-ui/react/combobox';
import { Check, SearchIcon } from 'lucide-react';
import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Button from '../../Button';
import { type ComboboxOption } from '../../form/fields/Combobox/shared';
import InputField from '../../form/fields/InputField';
import { ScrollArea } from '../../ScrollArea';
import { dropdownItemVariants } from '../../styles/controlVariants';
import { cx } from '../../utils/cva';
import { type FacetedFilterConfig } from './types';

const messages = defineMessages({
  searchPlaceholder: {
    id: 'frescoUi.facetedFilter.searchPlaceholder',
    defaultMessage: 'Search...',
    description: 'Placeholder for the option search input in a faceted filter.',
  },
  noOptions: {
    id: 'frescoUi.facetedFilter.noOptions',
    defaultMessage: 'No options found.',
    description:
      'Empty state shown when the faceted filter search matches no options.',
  },
  selectAll: {
    id: 'frescoUi.facetedFilter.selectAll',
    defaultMessage: 'Select All',
    description: 'Button selecting every option in a faceted filter.',
  },
  deselectAll: {
    id: 'frescoUi.facetedFilter.deselectAll',
    defaultMessage: 'Deselect All',
    description: 'Button clearing every selected option in a faceted filter.',
  },
});

type FacetedFilterProps = {
  value: string[] | undefined;
  onChange: (value: string[] | undefined) => void;
  config: FacetedFilterConfig;
  data: unknown[];
};

export default function FacetedFilter({
  value,
  onChange,
  config,
  data,
}: FacetedFilterProps) {
  const intl = useAppIntl();
  const resolvedOptions =
    typeof config.options === 'function'
      ? config.options(data)
      : config.options;

  const comboboxOptions: ComboboxOption[] = useMemo(
    () =>
      resolvedOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [resolvedOptions],
  );

  const selectedValues = useMemo(() => value ?? [], [value]);

  const selectedOptions = useMemo(
    () =>
      comboboxOptions.filter((opt) =>
        selectedValues.includes(String(opt.value)),
      ),
    [comboboxOptions, selectedValues],
  );

  const handleValueChange = (
    newValue: unknown[] | null,
    _event: Combobox.Root.ChangeEventDetails,
  ) => {
    if (newValue === null || newValue.length === 0) {
      onChange(undefined);
    } else {
      const typedValue = newValue as ComboboxOption[];
      onChange(typedValue.map((opt) => String(opt.value)));
    }
  };

  const handleSelectAll = () => {
    onChange(comboboxOptions.map((opt) => String(opt.value)));
  };

  const handleDeselectAll = () => {
    onChange(undefined);
  };

  return (
    <Combobox.Root
      multiple
      items={comboboxOptions}
      value={selectedOptions}
      onValueChange={handleValueChange}
      open
    >
      <div className="flex flex-col gap-3">
        <Combobox.Input
          placeholder={intl.formatMessage(messages.searchPlaceholder)}
          render={({ onChange: renderOnChange, ...rest }) => {
            const inputFieldProps =
              rest as unknown as React.ComponentPropsWithRef<typeof InputField>;
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
        <Combobox.Empty className="text-center text-sm text-current/50 italic empty:hidden">
          {intl.formatMessage(messages.noOptions)}
        </Combobox.Empty>
        <Combobox.List
          className="inset-surface max-h-64 overflow-hidden rounded-sm has-data-empty:hidden"
          render={<ScrollArea viewportClassName="px-2" fade={false} />}
        >
          {(option: ComboboxOption) => (
            <Combobox.Item
              key={option.value}
              value={option}
              disabled={option.disabled}
              className={dropdownItemVariants()}
            >
              <Combobox.ItemIndicator className="flex size-4 items-center justify-center">
                <Check className="size-[1em]" />
              </Combobox.ItemIndicator>
              <span
                className={cx(
                  'flex-1',
                  !selectedValues.includes(String(option.value)) && 'ms-4',
                )}
              >
                {option.label}
              </span>
            </Combobox.Item>
          )}
        </Combobox.List>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSelectAll}>
            {intl.formatMessage(messages.selectAll)}
          </Button>
          <Button size="sm" onClick={handleDeselectAll}>
            {intl.formatMessage(messages.deselectAll)}
          </Button>
        </div>
      </div>
    </Combobox.Root>
  );
}
