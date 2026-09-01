'use client';

import { ArrowUpRight, LoaderCircle, Search } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import {
  cloneElement,
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import InputField, {
  inputFieldControlVariants,
} from '../form/fields/InputField';
import { MotionSurface } from '../layout/Surface';
import Modal from '../Modal';
import ModalPopup from '../Modal/ModalPopup';
import { ScrollArea } from '../ScrollArea';
import { cva, cx } from '../utils/cva';
import { segmentLabel } from './everythingBarMatching';
import type { EverythingBarEntry } from './everythingBarMerge';
import {
  type EverythingBarGroup,
  type EverythingBarProvider,
} from './everythingBarModel';
import {
  DEFAULT_RECENTS_LIMIT,
  useEverythingBarRecents,
} from './everythingBarRecents';
import {
  DEFAULT_GROUP_BOUND,
  useEverythingBarResults,
  type EverythingBarRow,
} from './useEverythingBarResults';

export {
  EVERYTHING_BAR_GROUPS,
  qualifiedKey,
  type EverythingBarActivation,
  type EverythingBarGroup,
  type EverythingBarItem,
  type EverythingBarProvider,
  type EverythingBarRank,
  type EverythingBarSearchPage,
} from './everythingBarModel';
export type { EverythingBarRecentRef } from './everythingBarRecents';

/**
 * Every user-facing string the bar renders, already translated by the
 * consumer. They are whole strings: nothing here is concatenated from
 * fragments, and the keyboard keys the footer and chord hints render are keys,
 * not prose.
 */
export type EverythingBarLabels = {
  /** Placeholder shown in the header trigger. */
  triggerPlaceholder: string;
  /** Accessible name of the trigger on macOS, naming the ⌘K binding. */
  triggerMac: string;
  /** Accessible name of the trigger elsewhere, naming the Ctrl+K binding. */
  triggerOther: string;
  /** Accessible name of the dialog. */
  dialog: string;
  /** Accessible name of the search input. */
  searchLabel: string;
  /** Placeholder shown in the search input. */
  searchPlaceholder: string;
  /** Accessible name of the results listbox. */
  results: string;
  /** Heading of the recent-activations section. */
  recents: string;
  /** Headings of the three result groups. */
  groups: Record<EverythingBarGroup, string>;
  /** Row that reveals a group's next bounded slice. */
  showMore: string;
  /** Rendered while a group's provider is still searching. */
  pending: string;
  /** Rendered, and retried on activation, when a provider's search failed. */
  error: string;
  /** Rendered when a settled query matched nothing. */
  noResults: string;
  /** Politely announced once per settled query. */
  resultCount: (count: number) => string;
  footerNavigate: string;
  footerSelect: string;
  footerClose: string;
};

/**
 * Props handed to the consumer's link component for one result row. The bar is
 * router-agnostic: spread these onto a router link exactly as `SiteNavigation`
 * does, and the row's activation becomes an ordinary navigation the app's
 * router — and its dirty-state blocker — already understands.
 *
 * Every prop must reach the rendered element: `id`, `role` and `aria-selected`
 * are what make the row an option the combobox can point
 * `aria-activedescendant` at.
 */
export type EverythingBarLinkRenderProps = {
  'href': string;
  'children': ReactNode;
  'className': string;
  'id': string;
  'role': 'option';
  'aria-selected': boolean;
  'tabIndex': -1;
  'onClick': (event: MouseEvent<HTMLElement>) => void;
  'target'?: '_blank';
  'rel'?: string;
  'data-highlighted'?: '';
};

export type EverythingBarProps = {
  /**
   * The sources the bar searches. Providers own what exists and whether the
   * researcher may see it.
   */
  providers: EverythingBarProvider[];
  labels: EverythingBarLabels;
  /** Renders one result row as the app's router link. */
  renderLink: (props: EverythingBarLinkRenderProps) => ReactElement;
  /**
   * Called when a result whose activation is `open` is activated, with the
   * owning route and the surface identifier that route's screen registers. The
   * bar reports the activation; the destination screen performs it.
   */
  onOpenSurface?: (activation: { href: string; surface: string }) => void;
  /** Controlled open state, for an app whose shortcut registry owns ⌘K. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Locale used for folding, collation and matching. */
  locale?: string;
  /** Results shown per group before "show more". */
  groupBound?: number;
  /** Debounce applied to remote providers only. */
  debounceMs?: number;
  /**
   * Which modifier the shortcut hint names. Detected from the browser when
   * omitted; pass it explicitly when rendering on a server.
   */
  platform?: 'mac' | 'other';
  /** `localStorage` key for recents. Scope it per researcher. */
  recentsStorageKey?: string;
  recentsLimit?: number;
  /** Classes for the header trigger. */
  className?: string;
};

const rowVariants = cva({
  base: cx(
    'flex w-full min-w-0 cursor-pointer items-center gap-3 rounded px-3 py-2 text-left text-sm',
    'text-surface-popover-contrast no-underline',
  ),
  variants: {
    highlighted: {
      true: 'bg-primary text-primary-contrast',
      false: '',
    },
    motion: {
      true: 'spring-short',
      false: '',
    },
  },
});

const messageRowVariants = cx(
  'flex items-center gap-2 px-3 py-2 text-sm text-current/70 italic',
);

const keyHintVariants = cx(
  'inline-flex h-5 min-w-5 items-center justify-center rounded border border-current/20 bg-current/5 px-1.5 text-xs font-medium not-italic',
);

function detectPlatform(): 'mac' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const descriptor = `${navigator.platform ?? ''} ${navigator.userAgent}`;
  return /mac|iphone|ipad|ipod/i.test(descriptor) ? 'mac' : 'other';
}

/**
 * A single search-and-command surface: a dialog holding the ARIA combobox
 * pattern over one bounded, grouped result list.
 *
 * The bar is a launcher. It renders what its providers offer, reports the
 * declarative activation of whatever the researcher chose, and performs
 * nothing itself — navigation belongs to `renderLink`'s router, an `open`
 * activation to `onOpenSurface`, and an `external` one to the new tab the link
 * itself opens.
 *
 * ```tsx
 * <EverythingBar
 *   providers={providers}
 *   labels={labels}
 *   renderLink={(props) => <Link {...props} />}
 *   onOpenSurface={({ href, surface }) => router.navigate({ to: href, search: { surface } })}
 *   open={open}
 *   onOpenChange={setOpen}
 * />
 * ```
 *
 * The `⌘K` binding is deliberately not bound here: an app's shortcut registry
 * owns every binding, and drives this component through `open`.
 */
export default function EverythingBar({
  providers,
  labels,
  renderLink,
  onOpenSurface,
  open: openProp,
  onOpenChange,
  locale,
  groupBound = DEFAULT_GROUP_BOUND,
  debounceMs = 150,
  platform,
  recentsStorageKey = 'fresco-ui:everything-bar:recents',
  recentsLimit = DEFAULT_RECENTS_LIMIT,
  className,
}: EverythingBarProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [detectedPlatform] = useState(detectPlatform);
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const announcedGenerationRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion() ?? false;

  const open = openProp ?? uncontrolledOpen;
  const resolvedPlatform = platform ?? detectedPlatform;

  const recents = useEverythingBarRecents({
    providers,
    open,
    storageKey: recentsStorageKey,
    limit: recentsLimit,
  });
  const results = useEverythingBarResults({
    providers,
    open,
    query,
    recents: recents.entries,
    locale,
    bound: groupBound,
    debounceMs,
  });

  const { highlightKey, options, resultCount, settled, generation } = results;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) setQuery('');
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, openProp],
  );

  const optionId = useCallback(
    (key: string) => `${baseId}-${encodeURIComponent(key)}`,
    [baseId],
  );
  const listId = `${baseId}-results`;

  // One announcement per settled query, not one per arriving provider.
  useEffect(() => {
    if (!open) {
      announcedGenerationRef.current = null;
      setAnnouncement('');
      return;
    }
    if (results.isEmptyQuery || !settled) return;
    if (announcedGenerationRef.current === generation) return;
    announcedGenerationRef.current = generation;
    setAnnouncement(labels.resultCount(resultCount));
  }, [generation, labels, open, resultCount, results.isEmptyQuery, settled]);

  useEffect(() => {
    if (!open || highlightKey === null) return;
    const element = inputRef.current?.ownerDocument.getElementById(
      optionId(highlightKey),
    );
    element?.scrollIntoView({ block: 'nearest' });
  }, [highlightKey, open, optionId]);

  const activateItem = useCallback(
    (entry: EverythingBarEntry) => {
      recents.record(entry.providerId, entry.item);
      if (entry.item.activate.kind === 'open') {
        onOpenSurface?.({
          href: entry.item.activate.href,
          surface: entry.item.activate.surface,
        });
      }
      setOpen(false);
    },
    [onOpenSurface, recents, setOpen],
  );

  const activateRow = useCallback(
    (row: EverythingBarRow) => {
      if (row.kind === 'show-more') {
        results.showMore(row.group);
        return;
      }
      if (row.kind === 'error') {
        results.retry(row.providerId);
        return;
      }
      if (row.kind === 'pending') return;

      // The rendered link owns navigation, so the keyboard and the pointer
      // take exactly one path into the consumer's router.
      inputRef.current?.ownerDocument
        .getElementById(optionId(row.key))
        ?.click();
    },
    [optionId, results],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      results.moveHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      results.moveHighlight(-1);
      return;
    }
    if (event.key === 'Enter') {
      const row = options.find((candidate) => candidate.key === highlightKey);
      if (!row) return;
      event.preventDefault();
      activateRow(row);
    }
  };

  const renderRow = (row: EverythingBarRow) => {
    const highlighted = row.key === highlightKey;

    if (row.kind === 'pending') {
      return (
        <div key={row.key} role="presentation" className={messageRowVariants}>
          <LoaderCircle
            aria-hidden
            className={cx(
              'size-4 shrink-0',
              shouldReduceMotion ? undefined : 'animate-spin',
            )}
          />
          {labels.pending}
        </div>
      );
    }

    if (row.kind !== 'item') {
      return (
        <div
          key={row.key}
          id={optionId(row.key)}
          role="option"
          aria-selected={highlighted}
          tabIndex={-1}
          data-highlighted={highlighted ? '' : undefined}
          className={rowVariants({
            highlighted,
            motion: !shouldReduceMotion,
            className: 'font-medium',
          })}
          onClick={() => activateRow(row)}
        >
          {row.kind === 'show-more' ? labels.showMore : labels.error}
        </div>
      );
    }

    const { entry } = row;
    const { activate } = entry.item;
    const isExternal = activate.kind === 'external';

    const content = (
      <>
        <span className="min-w-0 flex-1 truncate">
          {segmentLabel(entry.item.label, entry.ranges).map(
            (segment, index) => (
              <Fragment key={index}>
                {segment.matched ? (
                  <mark className="bg-transparent font-semibold text-inherit">
                    {segment.text}
                  </mark>
                ) : (
                  segment.text
                )}
              </Fragment>
            ),
          )}
          {entry.item.context ? (
            <span className="ml-2 text-xs text-current/60">
              {entry.item.context}
            </span>
          ) : null}
        </span>
        {entry.item.chordHint ? (
          <span className="flex shrink-0 items-center gap-1">
            {entry.item.chordHint.map((key) => (
              <kbd key={key} className={keyHintVariants}>
                {key}
              </kbd>
            ))}
          </span>
        ) : null}
        {isExternal ? (
          <ArrowUpRight aria-hidden className="size-4 shrink-0" />
        ) : null}
      </>
    );

    return cloneElement(
      renderLink({
        'href': activate.href,
        'children': content,
        'className': rowVariants({
          highlighted,
          motion: !shouldReduceMotion,
        }),
        'id': optionId(row.key),
        'role': 'option',
        'aria-selected': highlighted,
        'tabIndex': -1,
        'onClick': () => activateItem(entry),
        'target': isExternal ? '_blank' : undefined,
        'rel': isExternal ? 'noreferrer' : undefined,
        'data-highlighted': highlighted ? '' : undefined,
      }),
      { key: row.key },
    );
  };

  const hasRows = results.sections.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          resolvedPlatform === 'mac' ? labels.triggerMac : labels.triggerOther
        }
        className={inputFieldControlVariants({
          size: 'md',
          state: 'normal',
          className: cx('w-full cursor-pointer', className),
        })}
      >
        <Search aria-hidden />
        <span className="text-input-contrast/50 min-w-0 grow basis-0 text-left italic">
          {labels.triggerPlaceholder}
        </span>
        <kbd
          aria-hidden
          className={cx(keyHintVariants, 'pointer-events-none shrink-0')}
        >
          {resolvedPlatform === 'mac' ? '⌘K' : 'Ctrl+K'}
        </kbd>
      </button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalPopup
          key="everything-bar-popup"
          aria-label={labels.dialog}
          initialFocus={inputRef}
          className="fixed top-[8vh] left-1/2 w-[44rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 bg-transparent shadow-none outline-none"
        >
          <MotionSurface
            floating
            noContainer
            spacing="none"
            shadow="lg"
            className="@container flex max-h-[70vh] flex-col overflow-hidden"
          >
            <header className="shrink-0 px-4 pt-4 pb-2">
              <InputField
                ref={inputRef}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  highlightKey === null ? undefined : optionId(highlightKey)
                }
                aria-label={labels.searchLabel}
                placeholder={labels.searchPlaceholder}
                value={query}
                onChange={(value) => {
                  setQuery(value ?? '');
                  // A new query re-anchors the highlight on the first result;
                  // only late results for the SAME query preserve it.
                  results.setHighlightKey(null);
                }}
                onKeyDown={handleKeyDown}
                prefixComponent={<Search aria-hidden />}
                className="w-full"
              />
            </header>

            <ScrollArea tabIndex={-1} viewportClassName="px-2 pb-2">
              <div
                id={listId}
                role="listbox"
                aria-label={labels.results}
                className="flex flex-col"
              >
                {results.sections.map((section) => {
                  const headingId = `${baseId}-section-${section.id}`;
                  const heading =
                    section.id === 'recents'
                      ? labels.recents
                      : section.id === 'other'
                        ? null
                        : labels.groups[section.id];

                  if (heading === null) {
                    return (
                      <Fragment key={section.id}>
                        {section.rows.map(renderRow)}
                      </Fragment>
                    );
                  }

                  return (
                    <div
                      key={section.id}
                      role="group"
                      aria-labelledby={headingId}
                      className="flex flex-col pb-1"
                    >
                      <div
                        id={headingId}
                        role="presentation"
                        className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-current/60 uppercase"
                      >
                        {heading}
                      </div>
                      {section.rows.map(renderRow)}
                    </div>
                  );
                })}
              </div>
              {!hasRows && !results.isEmptyQuery ? (
                <p className={messageRowVariants}>{labels.noResults}</p>
              ) : null}
            </ScrollArea>

            <div role="status" aria-live="polite" className="sr-only">
              {announcement}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-current/10 px-4 py-2 text-xs text-current/60">
              <span className="flex items-center gap-1.5">
                <kbd className={keyHintVariants}>↑</kbd>
                <kbd className={keyHintVariants}>↓</kbd>
                {labels.footerNavigate}
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className={keyHintVariants}>↵</kbd>
                {labels.footerSelect}
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className={keyHintVariants}>Esc</kbd>
                {labels.footerClose}
              </span>
            </footer>
          </MotionSurface>
        </ModalPopup>
      </Modal>
    </>
  );
}
