'use client';

import { Combobox } from '@base-ui/react/combobox';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Languages,
  SearchIcon,
} from 'lucide-react';
import {
  type ComponentPropsWithRef,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { AppLocale } from '@codaco/app-i18n/locales';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { Button } from '../Button';
import InputField from '../form/fields/InputField';
import Surface from '../layout/Surface';
import Pill from '../Pill';
import { usePortalContainer } from '../PortalContainer';
import { ScrollArea } from '../ScrollArea';
import {
  dropdownItemVariants,
  proportionalLucideIconVariants,
} from '../styles/controlVariants';
import Heading from '../typography/Heading';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';

const messages = defineMessages({
  heading: {
    id: 'frescoUi.localeSwitcher.heading',
    defaultMessage: 'Interface language',
    description:
      'Heading of the popover where the user chooses the language the application speaks.',
  },
  searchPlaceholder: {
    id: 'frescoUi.localeSwitcher.searchPlaceholder',
    defaultMessage: 'Search languages',
    description:
      'Placeholder of the search box that filters the list of interface languages.',
  },
  automaticCode: {
    id: 'frescoUi.localeSwitcher.automaticCode',
    defaultMessage: 'AUTO',
    description:
      'Short badge shown beside the automatic entry, where other entries show a language code such as EN.',
  },
  triggerAutomatic: {
    id: 'frescoUi.localeSwitcher.triggerAutomatic',
    defaultMessage: 'Auto · {code}',
    description:
      'Visible label of the switcher button while the automatic entry is chosen; {code} is the resolved language code such as EN.',
  },
  triggerName: {
    id: 'frescoUi.localeSwitcher.triggerName',
    defaultMessage: 'Interface language: {current}',
    description:
      'Accessible name of the switcher button; {current} is the chosen language’s name or the automatic wording.',
  },
  automaticCurrent: {
    id: 'frescoUi.localeSwitcher.automaticCurrent',
    defaultMessage: 'Automatic ({language})',
    description:
      'The automatic entry and the switcher button’s accessible name while it is chosen; {language} is the own name of the language the browser resolves to.',
  },
  noResults: {
    id: 'frescoUi.localeSwitcher.noResults',
    defaultMessage: 'No languages match your search.',
    description:
      'Shown in the language list when the search box filters out every language.',
  },
});

/** Above this many entries (the automatic one included) the list gets a search box. */
const SEARCH_THRESHOLD = 6;

type LocaleItem = {
  value: string | null;
  autonym: string;
  code: string;
};

export type LocaleSwitcherProps = {
  /** The locales to offer, in display order. */
  options: readonly AppLocale[];
  /** The stored preference; `null` is the automatic entry. */
  value: string | null;
  /** The tag the automatic entry resolves to right now. */
  automaticLocale: string;
  onChange: (value: string | null) => void;
  /** Host-supplied note under the list: what the choice applies to. */
  description?: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
};

function codeOf(tag: string): string {
  return tag.toUpperCase();
}

/**
 * The application language switcher: a pill that names the current language
 * and opens a popover listing every interface language, each under its own
 * `lang`. Hosts own persistence and the note about what the choice applies
 * to; the chrome copy is shared.
 */
export default function LocaleSwitcher({
  options,
  value,
  automaticLocale,
  onChange,
  description,
  side = 'bottom',
  align = 'end',
}: LocaleSwitcherProps) {
  const intl = useAppIntl();
  const headingId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();
  const [query, setQuery] = useState('');

  const autonymOf = (tag: string) =>
    options.find((entry) => entry.locale === tag)?.label ?? tag;

  const items: LocaleItem[] = [
    {
      value: null,
      autonym: intl.formatMessage(messages.automaticCurrent, {
        language: autonymOf(automaticLocale),
      }),
      code: intl.formatMessage(messages.automaticCode),
    },
    ...options.map((entry) => ({
      value: entry.locale,
      autonym: entry.label,
      code: codeOf(entry.locale),
    })),
  ];

  const selected = items.find((item) => item.value === value) ?? items[0]!;
  const automatic = selected.value === null;
  const showSearch = items.length > SEARCH_THRESHOLD;

  const triggerLabel = automatic
    ? intl.formatMessage(messages.triggerAutomatic, {
        code: codeOf(automaticLocale),
      })
    : selected.code;
  const triggerName = intl.formatMessage(messages.triggerName, {
    current: automatic
      ? intl.formatMessage(messages.automaticCurrent, {
          language: autonymOf(automaticLocale),
        })
      : selected.autonym,
  });
  const Chevron = side === 'top' ? ChevronUp : ChevronDown;

  return (
    <Combobox.Root
      items={items}
      value={selected}
      onValueChange={(next) => {
        if (next !== null) onChange(next.value);
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(item) =>
        [item.autonym, item.code].filter((part) => part !== undefined).join(' ')
      }
      inputValue={query}
      onInputValueChange={(next, details) => {
        if (details.reason === 'input-change') setQuery(next);
      }}
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
    >
      <Combobox.Trigger
        aria-label={triggerName}
        render={
          <Button
            variant="outline"
            color="dynamic"
            size="sm"
            icon={<Languages aria-hidden />}
            className="shrink-0 rounded-full"
          />
        }
      >
        <span className="tabular-nums">{triggerLabel}</span>
        <Chevron aria-hidden className="size-[1em] shrink-0" />
      </Combobox.Trigger>
      <Combobox.Portal container={portalContainer ?? undefined}>
        <Combobox.Positioner
          side={side}
          align={align}
          sideOffset={8}
          className="z-3000"
        >
          <Combobox.Popup
            aria-labelledby={headingId}
            initialFocus={showSearch ? undefined : listRef}
            render={
              <Surface
                floating
                shadow="lg"
                noContainer
                spacing="none"
                className="flex w-96 max-w-(--available-width) flex-col"
              />
            }
          >
            <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
              <Heading level="label" margin="none" id={headingId}>
                {intl.formatMessage(messages.heading)}
              </Heading>
              {showSearch && (
                <Combobox.Input
                  placeholder={intl.formatMessage(messages.searchPlaceholder)}
                  aria-label={intl.formatMessage(commonMessages.search)}
                  render={({ onChange: renderOnChange, ...renderProps }) => {
                    // Base UI's render props are typed as HTMLProps, which do
                    // not line up with InputField's own prop types but are the
                    // right thing at runtime (same cast as ComboboxField).
                    const inputFieldProps =
                      renderProps as unknown as ComponentPropsWithRef<
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
            </div>
            <Combobox.Empty
              className="px-4 pb-3 empty:hidden"
              render={
                <Paragraph intent="smallText" emphasis="muted" margin="none" />
              }
            >
              {intl.formatMessage(messages.noResults)}
            </Combobox.Empty>
            <Combobox.List
              ref={listRef}
              className="max-h-96 overflow-hidden has-data-empty:hidden"
              render={
                <ScrollArea viewportClassName="flex flex-col gap-1 px-2 pb-2" />
              }
            >
              {(item: LocaleItem) => (
                <Combobox.Item
                  key={item.value ?? 'automatic'}
                  value={item}
                  className={dropdownItemVariants({
                    className: 'group gap-3 text-start',
                  })}
                >
                  <span
                    className={cx(
                      proportionalLucideIconVariants(),
                      'flex size-4 shrink-0 items-center justify-center',
                    )}
                  >
                    <Combobox.ItemIndicator>
                      <Check />
                    </Combobox.ItemIndicator>
                  </span>
                  <span
                    className="min-w-0 flex-1 font-semibold"
                    lang={item.value ?? undefined}
                    dir={item.value === null ? undefined : 'auto'}
                  >
                    {item.autonym}
                  </span>
                  <Pill
                    size="sm"
                    variant="filled"
                    className="shrink-0 uppercase group-data-selected:bg-transparent"
                  >
                    {item.code}
                  </Pill>
                </Combobox.Item>
              )}
            </Combobox.List>
            {description != null && (
              <Paragraph
                intent="smallText"
                emphasis="muted"
                margin="none"
                className="bg-surface-1 text-surface-1-contrast border-outline border-t px-4 py-3 text-xs leading-tight"
              >
                {description}
              </Paragraph>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
