import { Combobox } from '@base-ui/react/combobox';
import type { LucideProps } from 'lucide-react';
import {
  ChevronDown,
  icons as lucideIconMap,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { type ComponentType, useMemo, useState } from 'react';

import Icon, { type InterviewerIconName } from '@codaco/fresco-ui/Icon';

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

  if (isCustomIconName(value)) {
    return { name: value, isCustom: true };
  }

  if (isLucideIconName(value)) {
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
    <div className="m-0 [&>h4]:m-0">
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
        <Combobox.Trigger className="border-surface-2 bg-surface-1 text-text flex w-full cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-left text-sm">
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
          <Combobox.Positioner align="start" sideOffset={4} className="z-3000">
            <Combobox.Popup className="border-surface-2 bg-surface-1 w-(--anchor-width) min-w-(--anchor-width) overflow-hidden rounded-sm border shadow-md">
              <div className="border-surface-2 flex items-center gap-2 border-b px-3 py-2">
                <Search size={16} className="text-charcoal shrink-0" />
                <Combobox.Input
                  placeholder="Search icons..."
                  className="text-text placeholder:text-charcoal min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>

              <Combobox.List className="max-h-72 overflow-y-auto p-1">
                {filteredIcons.map((entry) => (
                  <Combobox.Item
                    key={entry.isCustom ? `custom-${entry.name}` : entry.name}
                    value={entry}
                    className="text-text data-[highlighted]:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <IconPreview entry={entry} size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {entry.name}
                    </span>
                    <Combobox.ItemIndicator className="text-text shrink-0">
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
        <div className="text-destructive mt-1 text-sm">
          <TriangleAlert aria-hidden />
          {error}
        </div>
      )}
    </div>
  );
};

export default IconPicker;
