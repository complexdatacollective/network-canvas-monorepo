import { isEqual } from 'es-toolkit';
import { Columns3, Search } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import CheckboxField from '@codaco/fresco-ui/form/fields/Checkbox';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { Label } from '@codaco/fresco-ui/Label';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { Table } from '@codaco/fresco-ui/Table';
import {
  localeDirection,
  translationText,
  withTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import {
  type CurrentProtocol,
  type LocaleTag,
  messageText,
  sortByLanguageName,
} from '@codaco/protocol-validation';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import { setProtocolLocalizedString } from '~/ducks/modules/activeProtocol';
import {
  getLocalizationCoverage,
  getTranslationGroups,
  type TranslationGroup,
  type TranslationRow,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import {
  describePlace,
  type PlaceDetails,
  textSteps,
} from './MissingTranslations';
import TranslationCell, {
  type CommitResult,
  fallbackFor,
} from './TranslationCell';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  caption: {
    id: 'architect.localization.translationTable.caption',
    defaultMessage:
      'Every text participants see, with its translation into each of the protocol’s languages',
    description:
      'Caption of the translation table, read by screen readers. Each row is one text, each column one language.',
  },
  textColumn: {
    id: 'architect.localization.translationTable.textColumn',
    defaultMessage: 'Text',
    description:
      'Heading of the first column of the translation table, which names each text by where it is in the protocol.',
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
      'Under a language’s name in the heading of its column in the translation table: how many of the protocol’s texts have a translation into it.',
  },
  progressLabel: {
    id: 'architect.localization.translationTable.progressLabel',
    defaultMessage: '{language} translation progress',
    description:
      'Accessible name of the progress bar in the heading of a language’s column in the translation table.',
  },
  search: {
    id: 'architect.localization.translationTable.search',
    defaultMessage: 'Search texts and translations',
    description:
      'Label and placeholder of the search field above the translation table. It finds texts by where they are or by their translations into the languages shown.',
  },
  missingOnly: {
    id: 'architect.localization.translationTable.missingOnly',
    defaultMessage: 'Only texts with missing translations',
    description:
      'Checkbox above the translation table that hides the texts already translated into every language shown.',
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
      'Showing {shown, number} of {total, plural, one {# text} other {# texts}}',
    description:
      'Above the translation table: how many texts the search and filter leave in the table, out of every text the protocol has.',
  },
  noMatches: {
    id: 'architect.localization.translationTable.noMatches',
    defaultMessage: 'No texts match your search.',
    description:
      'Shown in the translation table when no text matches the search.',
  },
  allTranslated: {
    id: 'architect.localization.translationTable.allTranslated',
    defaultMessage: 'Every text is translated into the languages shown.',
    description:
      'Shown in the translation table when only texts with missing translations are shown and there are none.',
  },
  noTexts: {
    id: 'architect.localization.translationTable.noTexts',
    defaultMessage: 'This protocol has no text for participants yet.',
    description:
      'Shown in the translation table when the protocol has no participant-facing text at all.',
  },
  unlessBrowserLists: {
    id: 'architect.localization.translationTable.unlessBrowserLists',
    defaultMessage:
      '* Unless the participant’s browser also lists another language that has the text.',
    description:
      'Note under the translation table, explaining the asterisk on the tag that says which language participants see where a translation is missing. Begins with the same asterisk.',
  },
  groupHeading: {
    id: 'architect.localization.translationTable.groupHeading',
    defaultMessage: '<muted>{place}</muted> · <title>{name}</title>',
    description:
      'Heading of a group of rows in the translation table, naming the codebook entry that holds their texts. place is the kind of entry, such as “Node type”; name is its name, which links to it. Keep the tags around the same parts.',
  },
  groupHeadingDetail: {
    id: 'architect.localization.translationTable.groupHeadingDetail',
    defaultMessage:
      '<muted>{place}</muted> · <title>{name}</title> · <muted>{detail}</muted>',
    description:
      'Heading of a group of rows in the translation table, naming the stage that holds their texts. place is the stage’s position, such as “Stage 4”; name is the stage’s name, which links to it; detail is the kind of stage, such as “Name Generator”. Keep the tags around the same parts.',
  },
  keyboardHelp: {
    id: 'architect.localization.translationTable.keyboardHelp',
    defaultMessage:
      'Changes are saved when you leave a cell. Press Escape to undo a change before it is saved, and the up and down arrow keys to move between rows.',
    description:
      'Help text below the translation table, explaining how editing its cells works.',
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
  <span className="text-sm text-current/70">{chunks}</span>
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
          name: steps.map(({ label }) => label).join(NAME_SEPARATOR),
          rawName: raw,
          singleLine: isSingleLine(row),
        };
      }),
    };
  });

const findRow = (
  groups: readonly TranslationGroup[],
  path: TranslationRow['path'],
) => {
  const key = rowKey(path);
  for (const group of groups) {
    const found = group.rows.find((row) => rowKey(row.path) === key);
    if (found) return found;
  }
  return undefined;
};

/**
 * Every participant-facing text in one table: a row per text, grouped by the
 * stage or codebook entry that holds it, and a column per language, each cell
 * edited where it is shown.
 */
const TranslationTable = () => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const protocol = useAppSelector(getProtocol);
  const groups = useAppSelector(getTranslationGroups);
  const coverage = useAppSelector(getLocalizationCoverage);
  const baseId = useId();
  const searchId = useId();
  const missingOnlyId = useId();
  const helpId = useId();
  const tableRef = useRef<HTMLTableElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [hidden, setHidden] = useState<ReadonlySet<LocaleTag>>(new Set());
  const [missingOnly, setMissingOnly] = useState(false);
  const [query, setQuery] = useState('');
  // A row stays while it is being worked on, even once its last missing
  // translation is written or its text stops matching the search, so the
  // table does not shift under the cell in use.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());

  // Sticky group headings sit below the sticky column headings, whose height
  // depends on the languages' names and the width of the page.
  useLayoutEffect(() => {
    const head = headRef.current;
    const table = tableRef.current;
    if (!head || !table) return;
    const observer = new ResizeObserver(() => {
      table.style.setProperty(
        '--translation-table-head',
        `${head.getBoundingClientRect().height}px`,
      );
    });
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  if (!protocol) return null;

  const { localization } = protocol;
  const locales = sortByLanguageName(
    localization.locales,
    languageName,
    intl.locale,
  );
  const visible = locales.filter((locale) => !hidden.has(locale));
  const described = describeGroups(intl, protocol, groups);
  const total = described.reduce((sum, group) => sum + group.rows.length, 0);

  const needle = query.trim().toLocaleLowerCase(intl.locale);
  const matches = (group: ShownGroup, row: ShownRow) =>
    needle === '' ||
    [
      group.kind,
      group.title ?? '',
      row.name,
      ...visible.map((locale) => translationText(row.row.value, locale)),
    ].some((text) => text.toLocaleLowerCase(intl.locale).includes(needle));
  const isMissing = (row: ShownRow) =>
    visible.some((locale) => !Object.hasOwn(row.row.value, locale));

  const shownGroups = described.flatMap((group) => {
    const rows = group.rows.filter(
      (row) =>
        kept.has(row.key) ||
        ((!missingOnly || isMissing(row)) && matches(group, row)),
    );
    return rows.length > 0 ? [{ ...group, rows }] : [];
  });
  const shown = shownGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const filtering = missingOnly || needle !== '';

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

  const toggleLanguage = (locale: LocaleTag, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(locale);
    else next.add(locale);
    if (next.size === locales.length) return;
    setHidden(next);
    resetKept();
  };

  const commit =
    (path: TranslationRow['path'], locale: LocaleTag) =>
    (text: string): CommitResult => {
      const before = store.getState();
      const current = findRow(getTranslationGroups(before), path)?.value;
      const declared = getProtocol(before)?.localization.locales;
      if (current === undefined || declared === undefined) return 'failed';
      const next = withTranslation(current, locale, text);
      if (
        next === undefined ||
        !declared.some((declaredLocale) => Object.hasOwn(next, declaredLocale))
      ) {
        return 'only-translation';
      }
      if (isEqual(next, current)) return 'unchanged';
      dispatch(setProtocolLocalizedString({ path, value: next }));
      return getProtocol(store.getState()) === getProtocol(before)
        ? 'failed'
        : 'saved';
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
  const emptyMessage =
    total === 0
      ? messages.noTexts
      : needle === ''
        ? messages.allTranslated
        : messages.noMatches;

  const tableStyle: TableStyle = { '--translation-columns': visible.length };
  let rowIndex = -1;

  return (
    <div className="flex min-h-96 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
          className="w-full max-w-sm"
        />
        <div className="flex items-center gap-3">
          <CheckboxField
            id={missingOnlyId}
            value={missingOnly}
            onChange={(value) => {
              setMissingOnly(Boolean(value));
              resetKept();
            }}
          />
          <Label htmlFor={missingOnlyId} className="cursor-pointer">
            {intl.formatMessage(messages.missingOnly)}
          </Label>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                icon={<Columns3 aria-hidden />}
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
        <p role="status" className="ms-auto text-sm text-current/70">
          {intl.formatMessage(messages.shownCount, { shown, total })}
        </p>
      </div>
      <Table
        ref={tableRef}
        bodyScroll
        aria-describedby={helpId}
        style={tableStyle}
        className="w-[calc(var(--translation-table-names)+var(--translation-columns)*16rem)] min-w-full table-fixed border-separate border-spacing-0 [--translation-table-names:clamp(10rem,22vw,18rem)] [--translation-table-sticky-top:calc(var(--translation-table-head,0px)+3rem)]"
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
              className="bg-surface-2 border-outline sticky inset-s-0 top-0 z-40 border-e border-b px-3 py-2 text-start align-bottom text-sm font-semibold"
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
                  className="bg-surface-2 border-outline sticky top-0 z-30 border-e border-b px-3 py-2 text-start align-bottom font-normal"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span id={columnId(locale)} className="font-semibold">
                        {name}
                      </span>
                      {locale === localization.defaultLocale && (
                        <Badge render={<span />} size="sm" tone="primary">
                          {intl.formatMessage(messages.defaultLanguage)}
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-current/70">
                      {intl.formatMessage(messages.progress, {
                        translated,
                        total: coverage.total,
                      })}
                    </span>
                    <div aria-hidden className="w-full max-w-40">
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
                      />
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
                {intl.formatMessage(
                  filtering || total === 0 ? emptyMessage : messages.noTexts,
                )}
              </td>
            </tr>
          </tbody>
        )}
        {shownGroups.map((group, groupIndex) => {
          const groupId = `${baseId}-group-${groupIndex}`;
          return (
            <tbody key={group.key}>
              <tr>
                <th
                  id={groupId}
                  scope="rowgroup"
                  colSpan={visible.length + 1}
                  className="bg-surface-1 border-outline sticky top-(--translation-table-head,0px) z-20 border-b p-0 text-start font-normal"
                >
                  <div className="sticky inset-s-0 w-max max-w-[min(100vw,60rem)] px-3 py-2">
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
                      className="bg-surface border-outline sticky inset-s-0 z-10 border-e border-b px-3 py-2 text-start align-top font-normal"
                    >
                      {row.rawName ? (
                        <span
                          dir="ltr"
                          className="font-monospace text-sm break-words"
                        >
                          {row.name}
                        </span>
                      ) : (
                        <span className="text-sm break-words">{row.name}</span>
                      )}
                    </th>
                    {visible.map((locale, colIndex) => (
                      <TranslationCell
                        key={locale}
                        value={row.row.value}
                        format={row.row.format}
                        singleLine={row.singleLine}
                        locale={locale}
                        localization={localization}
                        rowName={row.name}
                        labelledBy={`${groupId} ${rowId} ${columnId(locale)}`}
                        rowIndex={currentRow}
                        colIndex={colIndex}
                        onCommit={commit(row.row.path, locale)}
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
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-current/70">
        <p id={helpId}>{intl.formatMessage(messages.keyboardHelp)}</p>
        {footnote && <p>{intl.formatMessage(messages.unlessBrowserLists)}</p>}
      </div>
    </div>
  );
};

export default TranslationTable;
