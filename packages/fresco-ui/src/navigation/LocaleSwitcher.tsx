'use client';

import { Combobox } from '@base-ui/react/combobox';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Languages,
  SearchIcon,
  X,
} from 'lucide-react';
import {
  type ComponentPropsWithRef,
  type ReactNode,
  useEffect,
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
import Spinner from '../Spinner';
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
  saving: {
    id: 'frescoUi.localeSwitcher.saving',
    defaultMessage: 'Saving…',
    description:
      'Footer status while the chosen language is being stored, beside a spinner.',
  },
  savedOnDevice: {
    id: 'frescoUi.localeSwitcher.savedOnDevice',
    defaultMessage: 'Saved on this device.',
    description:
      'Footer status after the chosen language was stored in this browser, beside a check mark.',
  },
  savedOnAccount: {
    id: 'frescoUi.localeSwitcher.savedOnAccount',
    defaultMessage: 'Saved to your account.',
    description:
      'Footer status after the chosen language was stored on the user’s account, beside a check mark.',
  },
  saveFailed: {
    id: 'frescoUi.localeSwitcher.saveFailed',
    defaultMessage: 'Couldn’t save. The language applies for now.',
    description:
      'Footer status when storing the chosen language failed; the language is still in use for this visit, and a retry button follows.',
  },
});

/** How long the "saved" status stays before the footer note returns. */
const SAVED_NOTICE_MS = 3000;

export type LocaleSwitcherSaveState = 'idle' | 'saving' | 'saved' | 'failed';

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
  /**
   * Where the host's persistence stands. `saving` shows a spinner, `saved` a
   * check mark that gives way to the note after a moment, `failed` a retry
   * button that calls `onChange` again with the current value.
   */
  saveState?: LocaleSwitcherSaveState;
  /** Which "saved" wording applies: stored in this browser, or on an account. */
  persistence?: 'device' | 'account';
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** Open on first render; for documentation, hosts never need it. */
  defaultOpen?: boolean;
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
  saveState = 'idle',
  persistence = 'device',
  side = 'bottom',
  align = 'end',
  defaultOpen,
}: LocaleSwitcherProps) {
  const intl = useAppIntl();
  const headingId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();
  const [query, setQuery] = useState('');

  // The footer shows the outcome of a choice made here. `awaiting` is set by
  // a choice or a retry so a repeat of the host's previous state ("saved"
  // again) still reads as a fresh outcome; the key restarts the saved timer.
  const [awaiting, setAwaiting] = useState(false);
  const [notice, setNotice] = useState<{
    state: Exclude<LocaleSwitcherSaveState, 'idle'>;
    key: number;
  } | null>(null);
  useEffect(() => {
    if (saveState === 'idle') {
      setNotice(null);
      return;
    }
    setNotice((current) => ({
      state: saveState,
      key: (current?.key ?? 0) + 1,
    }));
    if (saveState !== 'saving') setAwaiting(false);
  }, [saveState, awaiting]);
  useEffect(() => {
    if (notice?.state !== 'saved') return;
    const timer = setTimeout(() => setNotice(null), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const choose = (next: string | null) => {
    setAwaiting(true);
    onChange(next);
  };

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
      defaultOpen={defaultOpen}
      onValueChange={(next) => {
        if (next !== null) choose(next.value);
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(item) =>
        [item.autonym, item.code].filter((part) => part !== undefined).join(' ')
      }
      inputValue={query}
      onInputValueChange={(next, details) => {
        if (details.reason === 'input-change') setQuery(next);
      }}
      onOpenChange={(open, details) => {
        // A choice keeps the popover open so its outcome is read where it was
        // made; Escape, an outside press, or leaving still close it.
        if (!open && details.reason === 'item-press') {
          details.cancel();
          return;
        }
        if (!open) {
          setQuery('');
          setNotice(null);
        }
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
            {(description != null || notice !== null) && (
              <div className="bg-surface-1 text-surface-1-contrast border-outline border-t px-4 py-3 text-xs leading-tight">
                {notice === null && (
                  <Paragraph intent="smallText" emphasis="muted" margin="none">
                    {description}
                  </Paragraph>
                )}
                <div
                  role="status"
                  aria-live="polite"
                  className={
                    notice === null
                      ? 'sr-only'
                      : 'flex min-h-6 items-center gap-2'
                  }
                >
                  {notice?.state === 'saving' && (
                    <>
                      <Spinner size="xs" />
                      <span>{intl.formatMessage(messages.saving)}</span>
                    </>
                  )}
                  {notice?.state === 'saved' && (
                    <>
                      <Check
                        aria-hidden
                        className="text-success size-4 shrink-0"
                      />
                      <span>
                        {intl.formatMessage(
                          persistence === 'account'
                            ? messages.savedOnAccount
                            : messages.savedOnDevice,
                        )}
                      </span>
                    </>
                  )}
                  {notice?.state === 'failed' && (
                    <>
                      <X
                        aria-hidden
                        className="text-destructive size-4 shrink-0"
                      />
                      <span className="flex-1">
                        {intl.formatMessage(messages.saveFailed)}
                      </span>
                      <Button
                        size="sm"
                        variant="text"
                        color="dynamic"
                        onClick={() => choose(value)}
                      >
                        {intl.formatMessage(commonMessages.retry)}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
