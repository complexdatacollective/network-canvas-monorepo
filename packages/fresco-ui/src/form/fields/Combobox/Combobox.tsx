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

import { Button } from '../../../Button';
import { useComboboxTriggerEscape } from '../../../hooks/useComboboxTriggerEscape';
import Surface from '../../../layout/Surface';
import { usePortalContainer } from '../../../PortalContainer';
import {
  isPresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from '../../../PresentationalText';
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
      '{count, plural, =1 {# {singular} selected} other {# {plural} selected}}',
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
    /**
     * An option that depends on what has been typed into the search box, such
     * as a value that can be entered but is too many to list. Called with the
     * trimmed search text whenever it is not empty; return `undefined` when the
     * text offers nothing. A returned option whose value is already in
     * `options` is ignored, so it never appears twice.
     *
     * The option is listed after the matches for the text, and is listed
     * whatever its `label` is: it does not have to contain the search text.
     * Once chosen it stays in the list for as long as it is selected.
     */
    optionFromSearch?: (search: string) => ComboboxOption | undefined;
    /**
     * Choose one option instead of several. Choosing an option replaces the
     * choice and closes the list; choosing the chosen option again keeps it.
     * The value is still a list, holding at most one value, and "Select All" and
     * "Deselect All" are not shown unless asked for.
     */
    single?: boolean;
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
    isPresentationalText(value.label)
  );
}

function ComboboxField(props: ComboboxFieldProps) {
  const intl = useAppIntl();
  const {
    options,
    optionFromSearch,
    single = false,
    placeholder = intl.formatMessage(messages.placeholder),
    searchPlaceholder = intl.formatMessage(messages.searchPlaceholder),
    emptyMessage = intl.formatMessage(messages.noItems),
    showSearch = true,
    showSelectAll = !single,
    showDeselectAll = !single,
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
    'open': openProp,
    defaultOpen,
    ...rest
  } = props;

  // Workaround until base-ui ships `keepFilterText` (mui/base-ui#4360).
  // The recommended pattern from mui/base-ui#3977 is to control `inputValue`
  // and only honour `input-change`, so base-ui's internal `input-clear` on
  // item press doesn't wipe the user's search query.
  const [inputValue, setInputValue] = useState('');

  const portalContainer = usePortalContainer();

  const { open, onOpenChange, onTriggerKeyDown } = useComboboxTriggerEscape({
    open: openProp,
    defaultOpen,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) setInputValue('');
    },
  });

  // Rendering only: for one render the store can still hold the previous
  // field's value (see the render-tolerance contract on `useField`), and
  // anything but a list of chosen values renders as nothing selected.
  const selectedValues = useMemo(
    () => (Array.isArray(value) ? value : EMPTY_SELECTION),
    [value],
  );

  const handleValueChange = (
    newValue: unknown[] | null,
    _event: Combobox.Root.ChangeEventDetails,
  ) => {
    if (readOnly) return;
    if (newValue === null) {
      onChange?.([]);
    } else if (newValue.every(isComboboxOption)) {
      if (single) {
        const [chosen] = newValue.filter(
          (opt) => !selectedValues.includes(opt.value),
        );
        // Choosing the chosen option again leaves it chosen.
        if (chosen === undefined) return;
        setChosenFromSearch(
          options.some((option) => option.value === chosen.value)
            ? []
            : [chosen],
        );
        onChange?.([chosen.value]);
        onOpenChange(false);
        return;
      }
      const fromSearch = newValue.filter(
        (opt) => !options.some((option) => option.value === opt.value),
      );
      if (fromSearch.length > 0) setChosenFromSearch(fromSearch);
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

  // The options that came from the search text and have been chosen. Kept
  // while they are selected, because the text that offered them is gone once
  // the search is cleared.
  const [chosenFromSearch, setChosenFromSearch] = useState<ComboboxOption[]>(
    [],
  );

  const optionFromCurrentSearch = useMemo(() => {
    const search = inputValue.trim();
    if (!optionFromSearch || search === '') return undefined;
    const offered = optionFromSearch(search);
    return offered !== undefined &&
      !options.some((option) => option.value === offered.value)
      ? offered
      : undefined;
  }, [inputValue, optionFromSearch, options]);

  // Every option that can be shown or selected: the matches, then the ones
  // chosen from earlier searches, then the one the current text offers.
  const allOptions = useMemo(() => {
    const kept = chosenFromSearch.filter(
      (option) =>
        selectedValues.includes(option.value) &&
        !options.some((other) => other.value === option.value),
    );
    const offered =
      optionFromCurrentSearch !== undefined &&
      !kept.some((option) => option.value === optionFromCurrentSearch.value)
        ? [optionFromCurrentSearch]
        : [];
    return [...options, ...kept, ...offered];
  }, [chosenFromSearch, optionFromCurrentSearch, options, selectedValues]);

  // Convert value array to selected options
  const selectedOptions = useMemo(() => {
    return allOptions.filter((opt) => selectedValues.includes(opt.value));
  }, [allOptions, selectedValues]);

  // Base UI's own multiple-selection match, with the offered option always
  // matching: it is offered because of the text, not because it contains it.
  const { contains } = Combobox.useFilter({ multiple: true });
  const filter = useMemo(
    () =>
      optionFromCurrentSearch === undefined
        ? undefined
        : (
            item: unknown,
            query: string,
            itemToString?: (item: unknown) => string,
          ) =>
            (isComboboxOption(item) &&
              item.value === optionFromCurrentSearch.value) ||
            contains(item, query, itemToString),
    [contains, optionFromCurrentSearch],
  );

  // Generate trigger label text
  const triggerLabel = useMemo(() => {
    if (selectedValues.length === 0) return null;
    if (
      options.length > 0 &&
      options.every((option) => selectedValues.includes(option.value))
    ) {
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
  }, [selectedValues, options, singular, plural, intl]);

  const state = getInputState(props);

  return (
    <Combobox.Root
      // Base UI filters and announces items by `String(item.label)`, which
      // would read an object label as "[object Object]".
      itemToStringLabel={(option: ComboboxOption) =>
        presentationalTextValue(option.label)
      }
      filter={filter}
      {...rest}
      multiple
      items={allOptions}
      value={selectedOptions}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={handleInputValueChange}
      open={open}
      onOpenChange={onOpenChange}
      disabled={Boolean(disabled) || Boolean(readOnly)}
      name={name}
    >
      <Combobox.Trigger
        onKeyDown={onTriggerKeyDown}
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
        <span className="min-w-0 flex-1 truncate text-start">
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
        {/* The popup layer, as `Popover`'s: this can open from inside one. */}
        <Combobox.Positioner align="start" sideOffset={10} className="z-3000">
          <Combobox.Popup
            // The popup is a dialog when it holds the search input, and a
            // dialog needs a name of its own; the field's name is the one a
            // participant already knows it by.
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
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
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Base UI's input render props are native input props that InputField accepts at runtime; only the declared types differ
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
              render={<ScrollArea viewportClassName="flex flex-col px-2" />}
            >
              {(option: ComboboxOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className={dropdownItemVariants()}
                  {...presentationalTextProps(option.label)}
                >
                  <Combobox.ItemIndicator
                    className={cx(
                      proportionalLucideIconVariants(),
                      'flex size-4 items-center justify-center',
                    )}
                  >
                    <Check />
                  </Combobox.ItemIndicator>
                  {renderOption
                    ? renderOption(option)
                    : presentationalTextValue(option.label)}
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
