import { Combobox } from '@base-ui/react/combobox';
import type { LucideProps } from 'lucide-react';
import {
  Check,
  ChevronsUpDown,
  icons as lucideIconMap,
  Search,
} from 'lucide-react';
import {
  type ComponentPropsWithRef,
  type ComponentType,
  type FocusEventHandler,
  useMemo,
  useState,
} from 'react';
import type { WrappedFieldProps } from 'redux-form';

import { comboboxTriggerVariants } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Icon, { type InterviewerIconName } from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { dropdownItemVariants } from '@codaco/fresco-ui/styles/controlVariants';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import { cx } from '~/utils/cva';

const CUSTOM_ICONS = [
  'add-a-person',
  'add-a-place',
] as const satisfies readonly InterviewerIconName[];

type CustomIconEntry = {
  name: (typeof CUSTOM_ICONS)[number];
  isCustom: true;
};

type LucideIconEntry = {
  name: keyof typeof lucideIconMap;
  isCustom: false;
};

type IconEntry = CustomIconEntry | LucideIconEntry;

const allIcons: IconEntry[] = [
  ...CUSTOM_ICONS.map((name) => ({ name, isCustom: true }) as const),
  ...(Object.keys(lucideIconMap) as Array<keyof typeof lucideIconMap>).map(
    (name) => ({ name, isCustom: false }) as const,
  ),
];

const MAX_VISIBLE_ITEMS = 200;

function IconPreview({
  entry,
  size = 20,
}: {
  entry: IconEntry;
  size?: number;
}) {
  if (entry.isCustom) {
    return (
      <Icon
        name={entry.name}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  const LucideIcon = lucideIconMap[entry.name] as ComponentType<LucideProps>;
  return LucideIcon ? <LucideIcon size={size} /> : null;
}

function isCustomIconName(
  value: string,
): value is (typeof CUSTOM_ICONS)[number] {
  return (CUSTOM_ICONS as readonly string[]).includes(value);
}

function isLucideIconName(value: string): value is keyof typeof lucideIconMap {
  return Object.hasOwn(lucideIconMap, value);
}

function findEntryByValue(value: string): IconEntry | null {
  if (!value) return null;
  if (isCustomIconName(value)) return { name: value, isCustom: true };
  if (isLucideIconName(value)) return { name: value, isCustom: false };
  return null;
}

type IconPickerControlProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  'onBlur'?: FocusEventHandler;
  'onFocus'?: FocusEventHandler;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'required'?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-required'?: boolean;
};

const IconPickerControl = ({
  id,
  name,
  value = '',
  onChange,
  onBlur,
  onFocus,
  disabled = false,
  readOnly = false,
  required = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: IconPickerControlProps) => {
  const [query, setQuery] = useState('');
  const portalContainer = usePortalContainer();
  const selectedEntry = useMemo(
    () => findEntryByValue(value) ?? undefined,
    [value],
  );

  const filteredIcons = useMemo(() => {
    if (!query) {
      const visibleIcons = allIcons.slice(0, MAX_VISIBLE_ITEMS);
      if (
        !selectedEntry ||
        visibleIcons.some((entry) => entry.name === selectedEntry.name)
      ) {
        return visibleIcons;
      }

      return [selectedEntry, ...visibleIcons.slice(0, MAX_VISIBLE_ITEMS - 1)];
    }

    const lowerQuery = query.toLowerCase();
    const matches: IconEntry[] = [];
    for (const entry of allIcons) {
      if (entry.name.toLowerCase().includes(lowerQuery)) {
        matches.push(entry);
        if (matches.length >= MAX_VISIBLE_ITEMS) break;
      }
    }
    return matches;
  }, [query, selectedEntry]);
  const state = ariaInvalid
    ? 'invalid'
    : disabled
      ? 'disabled'
      : readOnly
        ? 'readOnly'
        : 'normal';

  return (
    <Combobox.Root<IconEntry>
      value={selectedEntry}
      filteredItems={filteredIcons}
      isItemEqualToValue={(item, selectedValue) =>
        item.name === selectedValue.name
      }
      itemToStringLabel={(item) => item.name}
      itemToStringValue={(item) => item.name}
      inputValue={query}
      onValueChange={(nextValue) => {
        if (nextValue && !disabled && !readOnly) onChange?.(nextValue.name);
      }}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
      disabled={disabled || readOnly}
      name={name}
    >
      <Combobox.Trigger
        id={id}
        onBlur={onBlur}
        onFocus={onFocus}
        aria-labelledby={ariaLabelledBy ?? (id ? `${id}-label` : undefined)}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={ariaRequired || required || undefined}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        className={comboboxTriggerVariants({
          state,
          className: 'w-full',
        })}
      >
        {selectedEntry ? (
          <>
            <span className="flex size-6 shrink-0 items-center justify-center">
              <IconPreview entry={selectedEntry} size={24} />
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedEntry.name}
            </span>
          </>
        ) : (
          <span className="text-input-contrast/50 min-w-0 flex-1 truncate text-left italic">
            Select an icon…
          </span>
        )}
        <ChevronsUpDown className="h-[1.2em] w-[1.2em] shrink-0" />
      </Combobox.Trigger>

      <Combobox.Portal container={portalContainer ?? undefined}>
        <Combobox.Positioner align="start" sideOffset={10} className="z-3000">
          <Combobox.Popup
            render={
              <Surface
                floating
                spacing="xs"
                shadow="lg"
                noContainer
                className="flex min-w-(--anchor-width) flex-col gap-4"
              />
            }
          >
            <Combobox.Input
              placeholder="Search icons…"
              render={({ onChange: renderOnChange, ...renderProps }) => {
                const inputFieldProps =
                  renderProps as unknown as ComponentPropsWithRef<
                    typeof InputField
                  >;
                return (
                  <InputField
                    {...inputFieldProps}
                    size="sm"
                    prefixComponent={<Search />}
                    className="w-full"
                    onChange={(nextQuery) => setQuery(nextQuery ?? '')}
                    nativeOnChange={renderOnChange}
                  />
                );
              }}
            />
            <Combobox.Empty className="text-center text-sm text-current/50 italic empty:hidden">
              No icons found
            </Combobox.Empty>
            <Combobox.List
              className="max-h-72 overflow-hidden has-data-empty:hidden"
              render={
                <ScrollArea viewportClassName="flex flex-col gap-1 px-2" />
              }
            >
              {filteredIcons.map((entry) => (
                <Combobox.Item
                  key={entry.isCustom ? `custom-${entry.name}` : entry.name}
                  value={entry}
                  className={dropdownItemVariants()}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    <IconPreview entry={entry} size={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <Combobox.ItemIndicator
                    className={cx(
                      'flex size-4 shrink-0 items-center justify-center',
                    )}
                  >
                    <Check />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
};

type IconPickerProps = WrappedFieldProps & {
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
};

const FrescoIconPickerControl = IconPickerControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as unknown as ComponentType<
  Record<string, unknown>
>;

const IconPickerBase = ({ label = 'Icon', ...props }: IconPickerProps) => (
  <ReduxFieldAdapter
    {...props}
    label={label}
    fieldComponent={FrescoIconPickerControl}
  />
);

const IconPicker = IconPickerBase as unknown as ComponentType<
  Record<string, unknown>
>;

export default IconPicker;
