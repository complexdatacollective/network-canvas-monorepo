'use client';

import { Combobox } from '@base-ui/react/combobox';
import {
  Check,
  ChevronsUpDown,
  icons as lucideIcons,
  Search,
} from 'lucide-react';
import { type ComponentPropsWithRef, useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Icon, { type InterviewerIconName } from '../../Icon';
import customIcons from '../../icons/customIcons';
import Surface from '../../layout/Surface';
import { usePortalContainer } from '../../PortalContainer';
import { ScrollArea } from '../../ScrollArea';
import { dropdownItemVariants } from '../../styles/controlVariants';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';
import { comboboxTriggerVariants } from './Combobox/shared';
import InputField from './InputField';

const messages = defineMessages({
  selectAnIcon: {
    id: 'frescoUi.iconPicker.selectAnIcon',
    defaultMessage: 'Select an icon…',
    description:
      'Placeholder shown on the icon picker trigger while no icon has been chosen.',
  },
  searchIcons: {
    id: 'frescoUi.iconPicker.searchIcons',
    defaultMessage: 'Search icons…',
    description:
      'Placeholder of the search box inside the icon picker, which filters the icons by name.',
  },
  noIconsFound: {
    id: 'frescoUi.iconPicker.noIconsFound',
    defaultMessage: 'No icons found',
    description:
      'Shown in place of the icon list when the search matches no icon name.',
  },
  showingSome: {
    id: 'frescoUi.iconPicker.showingSome',
    defaultMessage:
      'Showing {count, number} of {total, number} icons — search to narrow them down.',
    description:
      'Told to the researcher when there are more icons than the picker lists at once, whether or not they have searched yet.',
  },
});

/**
 * Icon names are written two ways — `add-a-person` and `UserPlus` — so a
 * search for "add a person" or "user plus" should reach both. Comparing the
 * letters and digits alone is what lets one query cross the two conventions.
 */
function searchKey(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

/** Whether this exact name is one of the two sets `Icon` draws from. */
function isIconName(value: string): value is InterviewerIconName {
  return Object.hasOwn(customIcons, value) || Object.hasOwn(lucideIcons, value);
}

/**
 * Every icon an interview can draw, Network Canvas' own first.
 *
 * Both halves come from the maps `Icon` itself dispatches on, so the picker
 * offers exactly what the renderer supports: a list written out by hand here
 * would drift the moment either set changed, and an icon left off it would be
 * one a protocol can legally carry but this field could neither show nor
 * reproduce — the researcher would open a type that has an icon and be told
 * to choose one.
 */
const iconNames: InterviewerIconName[] = [
  ...Object.keys(customIcons),
  ...Object.keys(lucideIcons),
].filter(isIconName);

/**
 * Their search keys, alongside them: there are nearly 1,800 icons, and the
 * list is filtered on every keystroke.
 */
const searchKeys = new Map(iconNames.map((name) => [name, searchKey(name)]));

/**
 * How many icons the list holds at once. A list of all of them costs more to
 * render than it is worth: the search is how anyone reaches the far end of it,
 * and how many are being shown of how many is said whenever the cap bites.
 */
const MAX_VISIBLE_ITEMS = 200;

export type IconPickerProps = CreateFormFieldProps<
  string,
  'div',
  {
    /** Only reaches the control through `UnconnectedField`; `Field` strips
     * validation props and signals the same thing via `aria-required`. */
    required?: boolean;
  }
>;

/**
 * Searchable picker over every icon an interview can draw, each shown as
 * itself.
 *
 * Labelling belongs to the surrounding field — pass it through `Field`'s
 * `label`/`hint`.
 */
export default function IconPicker({
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
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: IconPickerProps) {
  const intl = useAppIntl();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const portalContainer = usePortalContainer();

  const selectedName = isIconName(value) ? value : undefined;

  const { visibleIcons, totalMatches } = useMemo(() => {
    if (!query) {
      const head = iconNames.slice(0, MAX_VISIBLE_ITEMS);
      // The held icon is listed even when it falls outside the head, so
      // opening the picker always shows what the field currently holds.
      const withSelection =
        selectedName === undefined || head.includes(selectedName)
          ? head
          : [selectedName, ...head.slice(0, MAX_VISIBLE_ITEMS - 1)];
      return {
        visibleIcons: withSelection,
        totalMatches: iconNames.length,
      };
    }

    const key = searchKey(query);
    const matches: InterviewerIconName[] = [];
    let matchCount = 0;
    for (const iconName of iconNames) {
      if (!searchKeys.get(iconName)?.includes(key)) continue;
      matchCount += 1;
      if (matches.length < MAX_VISIBLE_ITEMS) matches.push(iconName);
    }
    return { visibleIcons: matches, totalMatches: matchCount };
  }, [query, selectedName]);

  /** What is being shown of what, while the list is holding fewer than match. */
  const capped =
    totalMatches > visibleIcons.length
      ? intl.formatMessage(messages.showingSome, {
          count: visibleIcons.length,
          total: totalMatches,
        })
      : undefined;

  return (
    <Combobox.Root<InterviewerIconName>
      value={selectedName}
      filteredItems={visibleIcons}
      itemToStringLabel={(item) => item}
      itemToStringValue={(item) => item}
      inputValue={query}
      onValueChange={(nextValue) => {
        if (nextValue && !disabled && !readOnly) onChange?.(nextValue);
      }}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setQuery('');
      }}
      disabled={disabled || readOnly}
      name={name}
    >
      <Combobox.Trigger
        id={id}
        onBlur={onBlur}
        onFocus={onFocus}
        // `Field` names the control through `aria-labelledby`; a caller using
        // it standalone names it with `aria-label` instead. Both are
        // forwarded, and the `${id}-label` guess applies only when neither
        // was given — a labelledby pointing at nothing would otherwise beat a
        // perfectly good `aria-label`.
        aria-label={ariaLabel}
        aria-labelledby={
          ariaLabelledBy ??
          (ariaLabel === undefined && id !== undefined
            ? `${id}-label`
            : undefined)
        }
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={ariaRequired || required || undefined}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        className={comboboxTriggerVariants({
          state: getInputState({
            disabled,
            readOnly,
            'aria-invalid': ariaInvalid,
          }),
          className: 'w-full',
        })}
      >
        {selectedName === undefined ? (
          <span className="text-input-contrast/50 min-w-0 flex-1 truncate text-left italic">
            {intl.formatMessage(messages.selectAnIcon)}
          </span>
        ) : (
          <>
            <span className="flex size-6 shrink-0 items-center justify-center">
              <Icon name={selectedName} className="size-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedName}
            </span>
          </>
        )}
        <ChevronsUpDown className="h-[1.2em] w-[1.2em] shrink-0" />
      </Combobox.Trigger>

      {/* Mounted from the first render, and outside the popup, which exists
          only while the picker is open. A live region that arrives already
          holding its text is not reliably announced, so this one waits here
          empty for the text rather than appearing with it — and it stays
          empty until the list is actually open, so nothing is announced about
          a list nobody has asked for yet. */}
      <span aria-live="polite" className="sr-only">
        {isOpen ? capped : undefined}
      </span>

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
              placeholder={intl.formatMessage(messages.searchIcons)}
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
              {intl.formatMessage(messages.noIconsFound)}
            </Combobox.Empty>
            <Combobox.List
              className="max-h-72 overflow-hidden has-data-empty:hidden"
              render={
                <ScrollArea viewportClassName="flex flex-col gap-1 px-2" />
              }
            >
              {visibleIcons.map((iconName) => (
                <Combobox.Item
                  key={iconName}
                  value={iconName}
                  className={dropdownItemVariants()}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    <Icon name={iconName} className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{iconName}</span>
                  <Combobox.ItemIndicator className="flex size-4 shrink-0 items-center justify-center">
                    <Check />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              ))}
            </Combobox.List>
            {/* The cap is a fact about the list a sighted reader cannot see
                either: the list simply stops. Said in a live region so that
                it arrives as the search narrows, rather than only on open. */}
            {/* Said in the popup, but not the thing that announces it: see
                the live region beside the trigger. */}
            {capped !== undefined && (
              <p className="px-2 text-center text-sm text-current/50 italic">
                {capped}
              </p>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

IconPicker.displayName = 'IconPicker';
