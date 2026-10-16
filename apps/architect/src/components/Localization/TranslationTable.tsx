import { CircleHelp, Columns3, Search } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'wouter';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import FormErrorsList from '@codaco/fresco-ui/form/FormErrors';
import { useForm } from '@codaco/fresco-ui/form/hooks/useForm';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import {
  FormStoreContext,
  useFormFieldScope,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FlattenedErrors } from '@codaco/fresco-ui/form/store/types';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { Table } from '@codaco/fresco-ui/Table';
import {
  localeDirection,
  translationText,
} from '@codaco/protocol-builder/localization/localizedText';
import {
  type CurrentProtocol,
  type LocaleTag,
  messageText,
  sortByLanguageName,
} from '@codaco/protocol-validation';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import { usePublishedBlockHeight } from '~/hooks/usePublishedBlockHeight';
import { useRefusedNestedCommit } from '~/hooks/useRefusedNestedCommit';
import {
  getLocalizationCoverage,
  getTranslationGroups,
  type TranslationGroup,
  type TranslationRow,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

import { describePlace, type PlaceDetails, textSteps } from './textPlaces';
import TranslationCell, { fallbackFor } from './TranslationCell';
import {
  readTranslationFieldName,
  saveTranslations,
} from './translationDrafts';
import {
  type MissingFilter,
  readFocusedLanguage,
  readMissingFilter,
  writeMissingFilter,
} from './translationTableLinks';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  about: {
    id: 'architect.localization.translationTable.about',
    defaultMessage:
      'This table shows everything participants see in the interview, with its translation into each language. Where a translation is missing, the cell shows what participants see instead.',
    description:
      'Opening paragraph of the help for the translation table, which explains what the table shows.',
  },
  help: {
    id: 'architect.localization.translationTable.help',
    defaultMessage: 'Help',
    description:
      'Button in the toolbar of the translation table that opens a short explanation of the table and how to edit it.',
  },
  caption: {
    id: 'architect.localization.translationTable.caption',
    defaultMessage:
      'Everything participants see, with its translation into each of the protocol’s languages',
    description:
      'Caption of the translation table, read by screen readers. Each row is one localized string, each column one language.',
  },
  textColumn: {
    id: 'architect.localization.translationTable.textColumn',
    defaultMessage: 'Location',
    description:
      'Heading of the first column of the translation table, which names each localized string by where it is in the protocol.',
  },
  defaultLanguage: {
    id: 'architect.localization.translationTable.defaultLanguage',
    defaultMessage: 'Default',
    description:
      'Badge beside the name of the protocol’s default language, in the heading of its column in the translation table.',
  },
  progress: {
    id: 'architect.localization.translationTable.progress',
    defaultMessage: '{translated, number} of {total, number} translated',
    description:
      'Read by screen readers in the heading of a language’s column in the translation table: how many of the protocol’s localized strings have a translation into it.',
  },
  progressCount: {
    id: 'architect.localization.translationTable.progressCount',
    defaultMessage: '{translated, number} of {total, number}',
    description:
      'Shown beside a language’s name and progress bar in the heading of its column in the translation table: how many of the protocol’s localized strings have a translation into it. Keep it as short as possible, since it shares one line with the language’s name.',
  },
  progressLabel: {
    id: 'architect.localization.translationTable.progressLabel',
    defaultMessage: '{language} translation progress',
    description:
      'Accessible name of the progress bar in the heading of a language’s column in the translation table.',
  },
  search: {
    id: 'architect.localization.translationTable.search',
    defaultMessage: 'Search translations',
    description:
      'Label and placeholder of the search field above the translation table. It finds localized strings by where they are or by their translations into the languages shown.',
  },
  filter: {
    id: 'architect.localization.translationTable.filter',
    defaultMessage: 'Translations to show',
    description:
      'Accessible name of the menu above the translation table that chooses whether it shows every localized string or only those with a translation missing.',
  },
  allTexts: {
    id: 'architect.localization.translationTable.allTexts',
    defaultMessage: 'All translations',
    description:
      'Option in the menu above the translation table that shows every localized string the protocol has.',
  },
  missingAny: {
    id: 'architect.localization.translationTable.missingAny',
    defaultMessage: 'Missing in any shown language',
    description:
      'Option in the menu above the translation table that shows only the localized strings with no translation into one or more of the languages whose columns are shown.',
  },
  missingLanguage: {
    id: 'architect.localization.translationTable.missingLanguage',
    defaultMessage: 'Missing {language}',
    description:
      'Option in the menu above the translation table, one per language, that shows only the localized strings with no translation into that language. language is the language’s name, such as “French”.',
  },
  languages: {
    id: 'architect.localization.translationTable.languages',
    defaultMessage: 'Languages ({shown, number} of {total, number})',
    description:
      'Button above the translation table that opens a menu for showing and hiding language columns. shown is how many languages are shown, total how many the protocol has.',
  },
  languagesMenu: {
    id: 'architect.localization.translationTable.languagesMenu',
    defaultMessage: 'Show languages',
    description:
      'Heading of the menu that shows and hides the language columns of the translation table.',
  },
  lastLanguage: {
    id: 'architect.localization.translationTable.lastLanguage',
    defaultMessage: 'One language is always shown.',
    description:
      'Note in the menu of language columns when only one language is shown, which therefore cannot be hidden.',
  },
  shownCount: {
    id: 'architect.localization.translationTable.shownCount',
    defaultMessage:
      'Showing {shown, number} of {total, plural, one {# string} other {# strings}}',
    description:
      'Above the translation table: how many localized strings the search and filter leave in the table, out of every localized string the protocol has.',
  },
  noMatches: {
    id: 'architect.localization.translationTable.noMatches',
    defaultMessage: 'Nothing matches your search.',
    description:
      'Shown in the translation table when no localized string matches the search.',
  },
  allTranslated: {
    id: 'architect.localization.translationTable.allTranslated',
    defaultMessage: 'Everything is translated into the languages shown.',
    description:
      'Shown in the translation table when only localized strings with missing translations are shown and there are none.',
  },
  allTranslatedInto: {
    id: 'architect.localization.translationTable.allTranslatedInto',
    defaultMessage: 'Everything is translated into {language}.',
    description:
      'Shown in the translation table when only localized strings with no translation into one language are shown and there are none. language is the language’s name, such as “French”.',
  },
  noTexts: {
    id: 'architect.localization.translationTable.noTexts',
    defaultMessage: 'This protocol has nothing for participants to read yet.',
    description:
      'Shown in the translation table when the protocol has no participant-facing localized strings at all.',
  },
  unlessBrowserLists: {
    id: 'architect.localization.translationTable.unlessBrowserLists',
    defaultMessage:
      '* Unless the participant’s browser also lists another language that has a translation.',
    description:
      'Note under the translation table, explaining the asterisk on the tag that says which language participants see where a translation is missing. Begins with the same asterisk.',
  },
  groupHeading: {
    id: 'architect.localization.translationTable.groupHeading',
    defaultMessage: '<muted>{place}</muted> · <title>{name}</title>',
    description:
      'Heading of a group of rows in the translation table, naming the codebook entry that holds their localized strings. place is the kind of entry, such as “Node type”; name is its name, which links to it. Keep the tags around the same parts.',
  },
  groupHeadingDetail: {
    id: 'architect.localization.translationTable.groupHeadingDetail',
    defaultMessage:
      '<muted>{place}</muted> · <title>{name}</title> · <muted>{detail}</muted>',
    description:
      'Heading of a group of rows in the translation table, naming the stage that holds their localized strings. place is the stage’s position, such as “Stage 4”; name is the stage’s name, which links to it; detail is the kind of stage, such as “Name Generator”. Keep the tags around the same parts.',
  },
  keyboardHelp: {
    id: 'architect.localization.translationTable.keyboardHelp',
    defaultMessage:
      'Select a cell to edit it. Your changes are kept in the table until you select Save, and each cell is checked when you leave it. Press Escape to undo your changes to a cell. When the cursor is on the first or last line of a cell, the up and down arrow keys move to the previous or next row. Ctrl+Enter (⌘+Enter on a Mac) also moves to the next row, as Enter does in a cell with one line. In a cell with formatting, Tab moves to the formatting buttons and then to the next cell, except in a list, where it indents the item.',
    description:
      'Help text for the translation table, explaining how editing its cells works. Nothing typed into the table reaches the protocol until the researcher selects Save. Ctrl, Enter, ⌘, Escape and Tab are the names of keys; use the names printed on keyboards in your language. A cell with formatting holds text with bold, italics, headings or lists, which is edited with a row of formatting buttons above it.',
  },
});

type TableStyle = CSSProperties & {
  '--translation-columns': number;
};

type ShownRow = {
  key: string;
  row: TranslationRow;
  name: string;
  /** Whether the name is the text's path, for a text Architect cannot name. */
  rawName: boolean;
  singleLine: boolean;
};

type ShownGroup = {
  key: string;
  kind: string;
  title: PlaceDetails['name'];
  detail: string | null;
  href: string | null;
  rows: readonly ShownRow[];
};

const NAME_SEPARATOR = ' › ';

const renderMuted = (chunks: ReactNode[]) => (
  <span className="text-current/70">{chunks}</span>
);

const GroupHeading = ({ group }: { group: ShownGroup }) => {
  const { kind, title, detail, href } = group;
  if (title === null) return <span className="font-semibold">{kind}</span>;
  const renderTitle = (chunks: ReactNode[]) => {
    const name = (
      <span
        lang={title.lang ?? undefined}
        dir={title.lang === null ? undefined : localeDirection(title.lang)}
      >
        {chunks}
      </span>
    );
    return href === null ? (
      <span className="font-semibold">{name}</span>
    ) : (
      <NativeLink render={<Link href={href} />} className="font-semibold">
        {name}
      </NativeLink>
    );
  };
  return (
    <AppMessage
      message={
        detail === null ? messages.groupHeading : messages.groupHeadingDetail
      }
      values={{
        place: kind,
        name: title.text,
        detail,
        muted: renderMuted,
        title: renderTitle,
      }}
    />
  );
};

const rowKey = (path: TranslationRow['path']) => JSON.stringify(path);

// Set apart from the menu's other options, which a language tag could match.
const languageOption = (locale: LocaleTag) => `language:${locale}`;

const isSingleLine = (row: TranslationRow) =>
  Object.values(row.value).every(
    (message) => !messageText(message).includes('\n'),
  );

/** The groups as the table names them, before any filter applies. */
const describeGroups = (
  intl: ReturnType<typeof useAppIntl>,
  protocol: CurrentProtocol,
  groups: readonly TranslationGroup[],
): readonly ShownGroup[] =>
  groups.map((group) => {
    const details = describePlace(intl, protocol, group.place);
    return {
      key: group.key,
      kind: details.kind,
      title: details.name,
      detail: details.interfaceName,
      href: details.href,
      rows: group.rows.map((row) => {
        const { steps, raw } = textSteps(intl, protocol, row, details);
        return {
          key: rowKey(row.path),
          row,
          name: steps.join(NAME_SEPARATOR),
          rawName: raw,
          singleLine: isSingleLine(row),
        };
      }),
    };
  });

/**
 * A ref for each group's heading that publishes the heading's height to the
 * group's rows. The toolbar of a formatted text being edited sticks below the
 * column headings and the heading of its own group, which is taller where its
 * text wraps.
 */
const useGroupHeadingHeights = () => {
  const [observer] = useState(
    () =>
      new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.borderBoxSize[0]?.blockSize;
          const group = entry.target.closest('tbody');
          if (height === undefined || !group) continue;
          group.style.setProperty('--translation-group-head', `${height}px`);
        }
      }),
  );

  useEffect(() => () => observer.disconnect(), [observer]);

  return useCallback(
    (heading: HTMLTableCellElement | null) => {
      if (!heading) return;
      observer.observe(heading);
      return () => observer.unobserve(heading);
    },
    [observer],
  );
};

/**
 * A ref for each language heading's contents that publishes their natural
 * width to the heading cell, which widens its column to fit. A language's
 * name, progress bar and count then share one line whatever the name's length
 * in the interface's language, and every other column keeps its usual width.
 */
const useColumnHeadingWidths = () => {
  const [observer] = useState(
    () =>
      new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.borderBoxSize[0]?.inlineSize;
          const heading = entry.target.closest('th');
          if (!width || !heading) continue;
          heading.style.setProperty(
            '--translation-heading-width',
            `${width}px`,
          );
        }
      }),
  );

  useEffect(() => () => observer.disconnect(), [observer]);

  return useCallback(
    (contents: HTMLDivElement | null) => {
      if (!contents) return;
      observer.observe(contents);
      return () => observer.unobserve(contents);
    },
    [observer],
  );
};

type TranslationTableProps = {
  /** Leads the toolbar. */
  heading?: ReactNode;
  /** Ends the toolbar, after the table's own controls. */
  actions?: ReactNode;
  /** After every change the table holds has been saved into the protocol. */
  onSaved: () => void;
  /** Asks to close the table, saving nothing. */
  onCancel: () => void;
};

/**
 * Every participant-facing text in one table: a row per text, grouped by the
 * stage or codebook entry that holds it, and a column per language, each cell
 * edited where it is shown. A toolbar above it holds everything else, and the
 * table scrolls within what is left of its container.
 *
 * The table is a form: what is typed into its cells is kept in the form, each
 * cell checked as focus leaves it, until Save writes every change into the
 * protocol together. Save refuses while any cell holds text the protocol
 * cannot take, and takes the researcher to the first.
 *
 * Must be drawn inside the `FormStoreProvider` the cells keep their changes in.
 */
const TranslationTable = ({
  heading,
  actions,
  onSaved,
  onCancel,
}: TranslationTableProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const protocol = useAppSelector(getProtocol);
  const groups = useAppSelector(getTranslationGroups);
  const coverage = useAppSelector(getLocalizationCoverage);
  const baseId = useId();
  const searchId = useId();
  const filterId = useId();
  const helpId = useId();
  const tableRef = useRef<HTMLTableElement>(null);
  // Sticky group headings sit below the sticky column headings, whose height
  // depends on the languages' names and the width of the window.
  const headRef = usePublishedBlockHeight<HTMLTableSectionElement>(
    '--translation-table-head',
  );
  const groupHeadingRef = useGroupHeadingHeights();
  const columnHeadingRef = useColumnHeadingWidths();
  const [searchParams, setSearchParams] = useSearchParams();
  // Opened on one language, the table shows only its column and the default
  // language's, the text it is translated from.
  const [hidden, setHidden] = useState<ReadonlySet<LocaleTag>>(() => {
    const localization = protocol?.localization;
    if (!localization) return new Set();
    const focused = readFocusedLanguage(searchParams, localization.locales);
    if (focused === undefined) return new Set();
    return new Set(
      localization.locales.filter(
        (locale) => locale !== focused && locale !== localization.defaultLocale,
      ),
    );
  });
  const [query, setQuery] = useState('');
  // A row stays while it is being worked on, even once its last missing
  // translation is written or its text stops matching the search, so the
  // table does not shift under the cell in use.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const formStore = useContext(FormStoreContext);
  const formScope = useFormFieldScope();
  const refusedCommit = useRefusedNestedCommit();
  const { isSubmitting } = useFormMeta();
  // The refused save waiting for its first invalid cell to be on screen.
  const [unfocusedErrors, setUnfocusedErrors] =
    useState<FlattenedErrors | null>(null);

  // A cell Save refused is brought into view, whatever hid it, before it is
  // given focus: its row is kept past the search and filter, and its
  // language's column shown.
  const revealInvalidCells = (errors: FlattenedErrors) => {
    const cells = Object.keys(errors.fieldErrors).flatMap((name) => {
      const cell = readTranslationFieldName(name);
      return cell === undefined ? [] : [cell];
    });
    if (cells.length > 0) {
      setKept((current) => {
        const next = new Set(current);
        for (const { path } of cells) next.add(rowKey(path));
        return next;
      });
      setHidden((current) => {
        const next = new Set(current);
        for (const { locale } of cells) next.delete(locale);
        return next;
      });
    }
    setUnfocusedErrors(errors);
  };

  useLayoutEffect(() => {
    if (unfocusedErrors === null) return;
    focusFirstError(unfocusedErrors, tableRef.current, formScope);
    setUnfocusedErrors(null);
  }, [unfocusedErrors, formScope]);

  const { formProps, formErrors } = useForm({
    onSubmit: (values) => {
      const refusal = refusedCommit();
      if (refusal) return { success: false, formErrors: [refusal] };
      if (!formStore) return { success: false };
      const result = saveTranslations({
        values,
        getFieldState: (name) => formStore.getState().getFieldState(name),
        getState: store.getState,
        dispatch,
        intl,
      });
      if (result.success) {
        // What the cells hold is now what the protocol has, so closing the
        // table loses nothing and asks nothing.
        formStore.getState().rebaseToDocument(values);
        onSaved();
      }
      return result;
    },
    onSubmitInvalid: revealInvalidCells,
  });

  if (!protocol) return null;

  const { localization } = protocol;
  const locales = sortByLanguageName(
    localization.locales,
    languageName,
    intl.locale,
  );
  const visible = locales.filter((locale) => !hidden.has(locale));
  // Kept in the address, so a link can open the table on a language's gaps.
  const filter = readMissingFilter(searchParams, locales);
  const described = describeGroups(intl, protocol, groups);
  const total = described.reduce((sum, group) => sum + group.rows.length, 0);

  const needle = query.trim().toLocaleLowerCase(intl.locale);
  const matches = (group: ShownGroup, row: ShownRow) =>
    needle === '' ||
    [
      group.kind,
      group.title?.text ?? '',
      row.name,
      ...visible.map((locale) => translationText(row.row.value, locale)),
    ].some((text) => text.toLocaleLowerCase(intl.locale).includes(needle));
  const isMissingIn = (row: ShownRow, locale: LocaleTag) =>
    !Object.hasOwn(row.row.value, locale);
  const passesFilter = (row: ShownRow) => {
    switch (filter.kind) {
      case 'all':
        return true;
      case 'any':
        return visible.some((locale) => isMissingIn(row, locale));
      case 'language':
        return isMissingIn(row, filter.locale);
    }
  };

  const shownGroups = described.flatMap((group) => {
    const rows = group.rows.filter(
      (row) => kept.has(row.key) || (passesFilter(row) && matches(group, row)),
    );
    return rows.length > 0 ? [{ ...group, rows }] : [];
  });
  const shown = shownGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const filtering = filter.kind !== 'all' || needle !== '';

  const footnote = shownGroups.some((group) =>
    group.rows.some((row) =>
      visible.some(
        (locale) =>
          !Object.hasOwn(row.row.value, locale) &&
          fallbackFor(row.row.value, locale, localization)?.unlessBrowserLists,
      ),
    ),
  );

  const resetKept = () => setKept(new Set());

  const chooseFilter = (next: MissingFilter) => {
    // The entry keeps its history state, which records where the table was
    // opened from.
    setSearchParams((params) => writeMissingFilter(params, next), {
      replace: true,
      state: window.history.state,
    });
    resetKept();
  };

  const toggleLanguage = (locale: LocaleTag, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(locale);
    else next.add(locale);
    if (next.size === locales.length) return;
    setHidden(next);
    resetKept();
    // A language's gaps are not listed once its column is hidden.
    if (filter.kind === 'language' && filter.locale === locale && !show) {
      chooseFilter({ kind: 'any' });
    }
  };

  const filterOptions = [
    { value: 'all', label: intl.formatMessage(messages.allTexts) },
    { value: 'any', label: intl.formatMessage(messages.missingAny) },
    ...locales.map((locale) => ({
      value: languageOption(locale),
      label: intl.formatMessage(messages.missingLanguage, {
        language: languageName(locale),
      }),
    })),
  ];

  const handleFilterChange = (value: string | number | undefined) => {
    if (value === 'all' || value === 'any') {
      chooseFilter({ kind: value });
      return;
    }
    const locale = locales.find((tag) => languageOption(tag) === value);
    if (locale === undefined) return;
    // Its column is shown, so its gaps can be filled where they are listed.
    if (hidden.has(locale)) {
      const next = new Set(hidden);
      next.delete(locale);
      setHidden(next);
    }
    chooseFilter({ kind: 'language', locale });
  };

  const move =
    (rowIndex: number, colIndex: number) =>
    (delta: number): boolean => {
      const target = tableRef.current?.querySelector<HTMLElement>(
        `[data-row="${rowIndex + delta}"][data-col="${colIndex}"]`,
      );
      if (!target) return false;
      target.focus();
      if (target instanceof HTMLTextAreaElement) {
        const end = target.value.length;
        target.setSelectionRange(end, end);
      }
      return true;
    };

  const columnId = (locale: LocaleTag) => `${baseId}-language-${locale}`;
  const emptyMessage = () => {
    if (total === 0) return intl.formatMessage(messages.noTexts);
    if (needle !== '') return intl.formatMessage(messages.noMatches);
    return filter.kind === 'language'
      ? intl.formatMessage(messages.allTranslatedInto, {
          language: languageName(filter.locale),
        })
      : intl.formatMessage(messages.allTranslated);
  };

  const tableStyle: TableStyle = { '--translation-columns': visible.length };
  let rowIndex = -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          {heading}
          <InputField
            id={searchId}
            type="search"
            value={query}
            onChange={(value) => {
              setQuery(value ?? '');
              resetKept();
            }}
            placeholder={intl.formatMessage(messages.search)}
            aria-label={intl.formatMessage(messages.search)}
            prefixComponent={<Search aria-hidden className="size-4" />}
            size="sm"
            className="max-w-80 min-w-56 flex-1 basis-64"
          />
          <NativeSelectField
            id={filterId}
            name="translation-table-filter"
            aria-label={intl.formatMessage(messages.filter)}
            value={
              filter.kind === 'language'
                ? languageOption(filter.locale)
                : filter.kind
            }
            onChange={handleFilterChange}
            options={filterOptions}
            size="sm"
            className="w-auto max-w-72 min-w-44"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Columns3 aria-hidden />}
                  className="px-3"
                />
              }
            >
              {intl.formatMessage(messages.languages, {
                shown: visible.length,
                total: locales.length,
              })}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {intl.formatMessage(messages.languagesMenu)}
                </DropdownMenuLabel>
                {locales.map((locale) => {
                  const isShown = !hidden.has(locale);
                  return (
                    <DropdownMenuCheckboxItem
                      key={locale}
                      checked={isShown}
                      disabled={isShown && visible.length === 1}
                      onCheckedChange={(checked) =>
                        toggleLanguage(locale, checked)
                      }
                    >
                      {languageName(locale)}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuGroup>
              {visible.length === 1 && (
                <p className="max-w-60 px-2 pt-2 text-sm text-current/70">
                  {intl.formatMessage(messages.lastLanguage)}
                </p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ms-auto flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <IconButton
                  size="sm"
                  variant="text"
                  color="dynamic"
                  icon={<CircleHelp aria-hidden />}
                  aria-label={intl.formatMessage(messages.help)}
                />
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="end"
                className="flex max-w-md flex-col gap-2 text-sm"
              >
                <p>{intl.formatMessage(messages.about)}</p>
                <p>{intl.formatMessage(messages.keyboardHelp)}</p>
              </PopoverContent>
            </Popover>
            {actions}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            color="default"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {intl.formatMessage(commonMessages.cancel)}
          </Button>
          <Button
            size="sm"
            color="primary"
            onClick={(event) => void formProps.onSubmit(event)}
            disabled={isSubmitting}
          >
            {intl.formatMessage(commonMessages.save)}
          </Button>
        </div>
      </div>
      {formErrors && formErrors.length > 0 && (
        <div className="px-6 pb-4">
          <FormErrorsList errors={formErrors} />
        </div>
      )}
      <Table
        ref={tableRef}
        bodyScroll
        // Scrollbars that take room of their own and show whenever the table
        // overflows, rather than floating over its sticky cells and fading
        // away between scrolls.
        scrollerClassName={cx(
          '[&::-webkit-scrollbar-corner]:bg-surface-1 [&::-webkit-scrollbar-track]:bg-surface-1 [&::-webkit-scrollbar]:size-3.5',
          '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-3 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-current/40 [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-thumb:hover]:bg-current/60',
        )}
        aria-describedby={helpId}
        style={tableStyle}
        surfaceProps={{
          className:
            'bg-surface text-surface-contrast border-outline mx-6 w-auto',
        }}
        className="w-[calc(var(--translation-table-names)+var(--translation-columns)*var(--translation-table-column))] min-w-full table-fixed border-separate border-spacing-0 [--translation-table-column:14.5rem] [--translation-table-names:clamp(10rem,13vw,14rem)]"
      >
        <caption className="sr-only">
          {intl.formatMessage(messages.caption)}
        </caption>
        <colgroup>
          <col className="w-(--translation-table-names)" />
          {visible.map((locale) => (
            <col key={locale} />
          ))}
        </colgroup>
        <thead ref={headRef}>
          <tr>
            <th
              scope="col"
              className="bg-surface-2 text-surface-2-contrast border-outline sticky inset-s-0 top-0 z-40 border-e border-b px-3 py-2.5 text-start text-sm font-semibold"
            >
              {intl.formatMessage(messages.textColumn)}
            </th>
            {visible.map((locale) => {
              const entry = coverage.locales.find(
                (candidate) => candidate.locale === locale,
              );
              const translated = entry?.translated ?? 0;
              const name = languageName(locale);
              return (
                <th
                  key={locale}
                  scope="col"
                  // Named by the language alone: a screen reader repeats the
                  // name on every move between columns.
                  aria-labelledby={columnId(locale)}
                  // In a fixed table the first row's widths size the columns:
                  // the usual width, or the heading's own where that is wider.
                  className="bg-surface-2 text-surface-2-contrast border-outline sticky top-0 z-30 w-[max(var(--translation-table-column),calc(var(--translation-heading-width,0px)+1.5rem+1px))] border-e border-b px-3 py-2.5 text-start font-normal"
                >
                  <div
                    ref={columnHeadingRef}
                    className="flex w-max items-center gap-3 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-2">
                      <span id={columnId(locale)} className="font-semibold">
                        {name}
                      </span>
                      {locale === localization.defaultLocale && (
                        <Badge render={<span />} size="sm" tone="primary">
                          {intl.formatMessage(messages.defaultLanguage)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div aria-hidden className="w-10">
                        <ProgressBar
                          orientation="horizontal"
                          percentProgress={
                            coverage.total === 0
                              ? 0
                              : (translated / coverage.total) * 100
                          }
                          nudge={false}
                          label={intl.formatMessage(messages.progressLabel, {
                            language: name,
                          })}
                          className="h-1.5"
                        />
                      </div>
                      <span
                        aria-hidden
                        className="text-xs whitespace-nowrap text-current/70"
                      >
                        {intl.formatMessage(messages.progressCount, {
                          translated,
                          total: coverage.total,
                        })}
                      </span>
                      <span className="sr-only">
                        {intl.formatMessage(messages.progress, {
                          translated,
                          total: coverage.total,
                        })}
                      </span>
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        {shownGroups.length === 0 && (
          <tbody>
            <tr>
              <td
                colSpan={visible.length + 1}
                className="px-3 py-10 text-center text-current/70"
              >
                {emptyMessage()}
              </td>
            </tr>
          </tbody>
        )}
        {shownGroups.map((group, groupIndex) => {
          const groupId = `${baseId}-group-${groupIndex}`;
          return (
            <tbody
              key={group.key}
              className="[--translation-table-sticky-top:calc(var(--translation-table-head,0px)+var(--translation-group-head,0px))]"
            >
              <tr>
                <th
                  ref={groupHeadingRef}
                  id={groupId}
                  scope="rowgroup"
                  colSpan={visible.length + 1}
                  className="bg-surface-1 text-surface-1-contrast border-outline sticky top-(--translation-table-head,0px) z-20 border-b p-0 text-start text-sm font-normal"
                >
                  {/* Stays at the start of the visible width as the table
                      scrolls sideways, so the heading is never cut off. */}
                  <div className="sticky inset-s-0 w-max max-w-[min(calc(100vw-4rem),60rem)] px-3 py-2">
                    <GroupHeading group={group} />
                  </div>
                </th>
              </tr>
              {group.rows.map((row) => {
                rowIndex += 1;
                const currentRow = rowIndex;
                const rowId = `${groupId}-row-${currentRow}`;
                return (
                  <tr
                    key={row.key}
                    onFocus={() => {
                      if (filtering && !kept.has(row.key)) {
                        setKept(new Set(kept).add(row.key));
                      }
                    }}
                  >
                    <th
                      id={rowId}
                      scope="row"
                      className="bg-surface border-outline sticky inset-s-0 z-10 border-e border-b px-3 py-2 text-start align-top text-sm font-normal text-current/80"
                    >
                      {row.rawName ? (
                        <span dir="ltr" className="font-monospace break-words">
                          {row.name}
                        </span>
                      ) : (
                        <span className="break-words">{row.name}</span>
                      )}
                    </th>
                    {visible.map((locale, colIndex) => (
                      <TranslationCell
                        key={locale}
                        row={row.row}
                        singleLine={row.singleLine}
                        locale={locale}
                        localization={localization}
                        labelledBy={`${groupId} ${rowId} ${columnId(locale)}`}
                        rowIndex={currentRow}
                        colIndex={colIndex}
                        onMove={move(currentRow, colIndex)}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </Table>
      <p id={helpId} className="sr-only">
        {intl.formatMessage(messages.keyboardHelp)}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-6 py-3 text-sm text-current/70">
        {footnote && <p>{intl.formatMessage(messages.unlessBrowserLists)}</p>}
        <p role="status" className="ms-auto whitespace-nowrap">
          {intl.formatMessage(messages.shownCount, { shown, total })}
        </p>
      </div>
    </div>
  );
};

export default TranslationTable;
