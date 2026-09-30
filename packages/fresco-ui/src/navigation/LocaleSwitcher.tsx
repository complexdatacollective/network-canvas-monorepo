'use client';

import { Combobox } from '@base-ui/react/combobox';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  SearchIcon,
  X,
} from 'lucide-react';
import {
  type ComponentPropsWithRef,
  type ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { AppLocale } from '@codaco/app-i18n/locales';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { Button, type ButtonProps, IconButton } from '../Button';
import InputField from '../form/fields/InputField';
import Surface from '../layout/Surface';
import { ArrowSvg } from '../Popover';
import {
  POPOVER_ARROW_CLASS_NAME,
  POPOVER_ARROW_PADDING,
} from '../popoverArrow';
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

/** How long the "saved" status stays before the footer goes away. */
const SAVED_NOTICE_MS = 3000;

export type LocaleSwitcherSaveState = 'idle' | 'saving' | 'saved' | 'failed';

export type LocaleSwitcherDisplay = 'responsive' | 'label' | 'icon';

// In `responsive` display the language name is dropped while the nearest
// `@container` ancestor is narrower than 36em (the threshold
// `TeamAndStudySwitcher` collapses at), leaving a round icon button. The
// explicit width per size mirrors `squareSizeVariants`: Safari computes 0 for
// a ratio-derived flex-item width inside nested flex rows.
const RESPONSIVE_ICON_ONLY_TRIGGER =
  '@max-xl:aspect-square @max-xl:justify-center @max-xl:p-0!';
const RESPONSIVE_ICON_ONLY_WIDTH: Record<
  NonNullable<ButtonProps['size']>,
  string
> = {
  sm: '@max-xl:w-10',
  md: '@max-xl:w-12',
  lg: '@max-xl:w-16',
  xl: '@max-xl:w-20',
};
const RESPONSIVE_HIDDEN = '@max-xl:hidden';

type LocaleItem = {
  value: string | null;
  autonym: string;
};

export type LocaleSwitcherProps = {
  /** The locales to offer, in display order. */
  options: readonly AppLocale[];
  /** The stored preference; `null` is the automatic entry. */
  value: string | null;
  /** The tag the automatic entry resolves to right now. */
  automaticLocale: string;
  onChange: (value: string | null) => void;
  /**
   * Where the host's persistence stands. `saving` shows a spinner, `saved` a
   * check mark that goes away after a moment, `failed` a retry button that
   * calls `onChange` again with the current value.
   */
  saveState?: LocaleSwitcherSaveState;
  /** Which "saved" wording applies: stored in this browser, or on an account. */
  persistence?: 'device' | 'account';
  /**
   * What the trigger shows beside the globe. `label` always names the current
   * language, `icon` never does (an icon button), and `responsive` names it
   * only while the nearest `@container` ancestor is at least 36em wide.
   */
  display?: LocaleSwitcherDisplay;
  /** Put a search box above the list, for hosts that offer many languages. */
  searchable?: boolean;
  /**
   * The trigger's `Button` look, so it can match the controls beside it. The
   * `text` default sits quietly in a header or status bar; `color="dynamic"`
   * takes the colour of the bar it sits on.
   */
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
  size?: ButtonProps['size'];
  /** Extra classes for the trigger button. */
  className?: string;
  /**
   * The trigger element, in place of the `Button` that `variant`, `color`,
   * `size` and `className` style: for a host whose bar dresses its own
   * controls, such as a navigation list the switcher sits in among links. It
   * receives the accessible name and the combobox state; the globe, and the
   * language name and chevron unless `display` is `icon`, are its children.
   */
  renderTrigger?: ReactElement;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** Open on first render; for documentation, hosts never need it. */
  defaultOpen?: boolean;
};

/**
 * The application language switcher: a globe button that names the current
 * language and opens a popover listing every interface language, each under
 * its own `lang`. Hosts own persistence and the button's look; the chrome
 * copy is shared.
 */
export default function LocaleSwitcher({
  options,
  value,
  automaticLocale,
  onChange,
  saveState = 'idle',
  persistence = 'device',
  display = 'responsive',
  searchable = false,
  variant = 'text',
  color = 'dynamic',
  size = 'sm',
  className,
  renderTrigger,
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

  const automaticAutonym = intl.formatMessage(messages.automaticCurrent, {
    language: autonymOf(automaticLocale),
  });
  const items: LocaleItem[] = [
    { value: null, autonym: automaticAutonym },
    ...options.map((entry) => ({ value: entry.locale, autonym: entry.label })),
  ];

  const selected = items.find((item) => item.value === value) ?? items[0]!;

  const triggerLocale = selected.value ?? automaticLocale;
  const triggerLabel =
    selected.value === null ? autonymOf(automaticLocale) : selected.autonym;
  const triggerName = intl.formatMessage(messages.triggerName, {
    current: selected.autonym,
  });
  const Chevron = side === 'top' ? ChevronUp : ChevronDown;
  const responsive = display === 'responsive';
  const globe = <Globe aria-hidden />;

  return (
    <Combobox.Root
      items={items}
      value={selected}
      defaultOpen={defaultOpen}
      onValueChange={(next) => {
        if (next !== null) choose(next.value);
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      // The tag is not shown but still matches a search, so "de" finds Deutsch.
      itemToStringLabel={(item) =>
        item.value === null ? item.autonym : `${item.autonym} ${item.value}`
      }
      inputValue={query}
      onInputValueChange={(next, details) => {
        if (details.reason === 'input-change') setQuery(next);
      }}
      onOpenChange={(open) => {
        if (!open) {
          setQuery('');
          setNotice(null);
        }
      }}
    >
      {display === 'icon' ? (
        <Combobox.Trigger
          aria-label={triggerName}
          render={
            renderTrigger ?? (
              <IconButton
                variant={variant}
                color={color}
                size={size}
                icon={globe}
                aria-label={triggerName}
                className={className}
              />
            )
          }
        >
          {renderTrigger ? globe : null}
        </Combobox.Trigger>
      ) : (
        <Combobox.Trigger
          aria-label={triggerName}
          render={
            renderTrigger ?? (
              <Button
                variant={variant}
                color={color}
                size={size}
                icon={globe}
                className={cx(
                  'shrink-0 rounded-full',
                  responsive && RESPONSIVE_ICON_ONLY_TRIGGER,
                  responsive && RESPONSIVE_ICON_ONLY_WIDTH[size ?? 'sm'],
                  className,
                )}
              />
            )
          }
        >
          {renderTrigger ? globe : null}
          <span
            className={cx(
              'min-w-0 truncate leading-normal',
              responsive && RESPONSIVE_HIDDEN,
            )}
            lang={triggerLocale}
            dir="auto"
          >
            {triggerLabel}
          </span>
          <Chevron
            aria-hidden
            className={cx(
              'size-[1em] shrink-0',
              responsive && RESPONSIVE_HIDDEN,
            )}
          />
        </Combobox.Trigger>
      )}
      <Combobox.Portal container={portalContainer ?? undefined}>
        <Combobox.Positioner
          side={side}
          align={align}
          sideOffset={10}
          arrowPadding={POPOVER_ARROW_PADDING}
          className="z-3000"
        >
          <Combobox.Popup
            aria-labelledby={headingId}
            initialFocus={searchable ? undefined : listRef}
            render={
              <Surface
                floating
                shadow="lg"
                noContainer
                spacing="none"
                className="flex w-96 max-w-(--available-width) flex-col overflow-visible"
              />
            }
          >
            <Combobox.Arrow className={POPOVER_ARROW_CLASS_NAME}>
              <ArrowSvg />
            </Combobox.Arrow>
            <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
              <Heading level="label" margin="none" id={headingId}>
                {intl.formatMessage(messages.heading)}
              </Heading>
              {searchable && (
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
                    className: 'gap-3 text-start',
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
                </Combobox.Item>
              )}
            </Combobox.List>
            <div
              role="status"
              aria-live="polite"
              className={
                notice === null
                  ? 'sr-only'
                  : 'bg-surface-1 text-surface-1-contrast border-outline flex min-h-6 items-center gap-2 rounded-b-[inherit] border-t px-4 py-3 text-xs leading-tight'
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
                  <Check aria-hidden className="text-success size-4 shrink-0" />
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
                    className="text-destructive-ink size-4 shrink-0"
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
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
