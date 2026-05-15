import { Combobox } from '@base-ui/react/combobox';
import type { LucideProps } from 'lucide-react';
import { ChevronDown, icons as lucideIconMap, Search } from 'lucide-react';
import { type ComponentType, useMemo, useState } from 'react';

import Icon from '~/lib/legacy-ui/components/Icon';

const CUSTOM_ICONS = ['add-a-person', 'add-a-place'] as const;

type IconEntry = {
  name: string;
  isCustom: boolean;
};

const allIcons: IconEntry[] = [
  ...CUSTOM_ICONS.map((name) => ({ name, isCustom: true })),
  ...Object.keys(lucideIconMap).map((name) => ({ name, isCustom: false })),
];

function IconPreview({
  entry,
  size = 20,
}: {
  entry: IconEntry;
  size?: number;
}) {
  if (entry.isCustom) {
    return <Icon name={entry.name} style={{ width: size, height: size }} />;
  }

  const LucideIcon = lucideIconMap[
    entry.name as keyof typeof lucideIconMap
  ] as ComponentType<LucideProps>;
  if (!LucideIcon) return null;
  return <LucideIcon size={size} />;
}

type InputProps = {
  value: string;
  onChange: (value: string) => void;
};

type MetaProps = {
  error?: string;
  invalid?: boolean;
  touched?: boolean;
};

type IconPickerProps = {
  input: InputProps;
  meta: MetaProps;
};

const MAX_VISIBLE_ITEMS = 200;

function findEntryByValue(value: string): IconEntry | null {
  if (!value) return null;

  if ((CUSTOM_ICONS as readonly string[]).includes(value)) {
    return { name: value, isCustom: true };
  }

  if (Object.hasOwn(lucideIconMap, value)) {
    return { name: value, isCustom: false };
  }

  return null;
}

const IconPicker = ({
  input,
  meta: { error, invalid, touched },
}: IconPickerProps) => {
  const [query, setQuery] = useState('');

  const filteredIcons = useMemo(() => {
    if (!query) return allIcons.slice(0, MAX_VISIBLE_ITEMS);

    const lowerQuery = query.toLowerCase();
    const matches: IconEntry[] = [];
    for (const entry of allIcons) {
      if (entry.name.toLowerCase().includes(lowerQuery)) {
        matches.push(entry);
        if (matches.length >= MAX_VISIBLE_ITEMS) break;
      }
    }
    return matches;
  }, [query]);

  const selectedEntry = useMemo(
    () => findEntryByValue(input.value) ?? undefined,
    [input.value],
  );

  const showError = invalid && touched && error;

  return (
    <div className="form-field-container">
      <Combobox.Root<IconEntry>
        value={selectedEntry}
        filteredItems={filteredIcons}
        onValueChange={(val) => {
          if (val) {
            input.onChange(val.name);
          }
        }}
        onInputValueChange={(inputValue) => {
          setQuery(inputValue);
        }}
      >
        <Combobox.Trigger className="border-surface-2 bg-surface-1 text-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-left text-sm">
          {selectedEntry ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                <IconPreview entry={selectedEntry} size={24} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {selectedEntry.name}
              </span>
            </>
          ) : (
            <span className="text-charcoal min-w-0 flex-1 truncate">
              Select an icon...
            </span>
          )}
          <ChevronDown size={16} className="text-charcoal shrink-0" />
        </Combobox.Trigger>

        <Combobox.Portal>
          <Combobox.Positioner
            align="start"
            sideOffset={4}
            className="z-(--z-tooltip)"
          >
            <Combobox.Popup className="border-surface-2 bg-surface-1 w-(--anchor-width) min-w-(--anchor-width) overflow-hidden rounded-sm border shadow-md">
              <div className="border-surface-2 flex items-center gap-2 border-b px-3 py-2">
                <Search size={16} className="text-charcoal shrink-0" />
                <Combobox.Input
                  placeholder="Search icons..."
                  className="text-foreground placeholder:text-charcoal min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>

              <Combobox.List className="max-h-72 overflow-y-auto p-1">
                {filteredIcons.map((entry) => (
                  <Combobox.Item
                    key={entry.isCustom ? `custom-${entry.name}` : entry.name}
                    value={entry}
                    className="text-foreground data-[highlighted]:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <IconPreview entry={entry} size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {entry.name}
                    </span>
                    <Combobox.ItemIndicator className="text-foreground shrink-0">
                      ✓
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                ))}
              </Combobox.List>

              <Combobox.Empty className="text-charcoal p-4 text-center text-sm empty:hidden">
                No icons found
              </Combobox.Empty>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {showError && (
        <div className="text-error mt-1 text-sm">
          <Icon name="warning" />
          {error}
        </div>
      )}
    </div>
  );
};

export default IconPicker;
