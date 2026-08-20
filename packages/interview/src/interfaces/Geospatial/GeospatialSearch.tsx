'use client';

import { Toggle } from '@base-ui/react';
import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  type Suggestion,
  type UseGeospatialSearchProps,
  useGeospatialSearch,
} from './useGeospatialSearch';

// Wrapper type that extends Suggestion with the required Record constraint
type SuggestionItem = Suggestion & Record<string, unknown>;

// Motion variants extracted to avoid recreation on every render
const searchContainerVariants = {
  initial: { opacity: 0, y: '-100%' },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '-100%' },
} as const;

// Prevent blur when clicking suggestions (fixes race condition)
const preventBlur = (e: React.MouseEvent) => e.preventDefault();

/**
 * Search outcomes, as whole sentences a translator can work with — never
 * assembled from fragments, and never a status code.
 */
const NO_RESULTS_MESSAGE = 'Nothing matched your search.';
/**
 * Kept distinct from `NO_RESULTS_MESSAGE` on purpose: a search that could not
 * run tells us nothing about whether the place exists, and saying "Nothing
 * matched your search." to someone who is simply offline is a false statement
 * the participant cannot act on.
 */
const SEARCH_FAILED_MESSAGE =
  'Search could not be completed. Try again in a moment.';
const RETRIEVE_FAILED_MESSAGE =
  'That place could not be loaded. Try another search.';
const movedMessage = (place: string) => `Map moved to ${place}.`;

export default function GeospatialSearch({
  accessToken,
  map,
  proximity,
  resetKey,
  onSearchPerformed,
  className,
}: UseGeospatialSearchProps & { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Stable ID for ARIA association between input and listbox
  const listboxId = useId();

  const {
    query,
    handleQueryChange,
    suggestions,
    isLoading,
    searchFailed,
    handleSelect,
    clear,
  } = useGeospatialSearch({
    accessToken,
    map,
    proximity,
    resetKey,
    onSearchPerformed,
  });

  // Layout inside component with useMemo to avoid shared instance issues
  const layout = useMemo(() => new ListLayout<SuggestionItem>({ gap: 0 }), []);

  /**
   * Tear the panel's state down. Deliberately does NOT touch focus.
   *
   * This also runs from the document-level `focusout` listener below, where
   * focus is already on its way to somewhere the participant chose. A
   * `.focus()` issued during `focusout` BEATS the browser's pending focus move
   * in Chrome, so restoring focus here would bounce Tab backwards onto the
   * toggle — and wipe the query on the way — and would steal the click from
   * whichever map control was just pressed. Focus restoration belongs to the
   * intentional closes below.
   */
  const resetField = useCallback(() => {
    setIsOpen(false);
    clear();
  }, [clear]);

  /**
   * Close the panel for a reason the participant chose — Escape, or picking a
   * suggestion — and hand focus back to the toggle that opened it.
   *
   * Selection is the route that was missing this: the `[role="option"]`
   * holding focus unmounted with the panel, leaving focus on `<body>` with the
   * sequential-focus starting point parked where the option had been, so the
   * next Tab resumed AFTER the toggle and landed on the zoom controls.
   */
  /**
   * Which selection the live region is currently speaking for.
   *
   * A selection announces when its `retrieve()` settles, which is a network
   * round trip after the panel has already closed — so a participant who picks
   * a place, reopens search and picks another has two in flight at once, and
   * they can settle in either order. Without this, the slower FIRST one lands
   * last and tells them the map moved to the place they changed their mind
   * about; the same stale settlement can arrive after `resetKey` has moved the
   * whole search on to another node, announcing a place that has nothing to do
   * with what is on screen. Each selection takes the next generation and only
   * speaks if it is still the current one.
   */
  const selectionGenerationRef = useRef(0);

  // Moving to another node supersedes any selection still in flight: whatever
  // it would say is about a map the participant has left.
  useEffect(() => {
    selectionGenerationRef.current += 1;
  }, [resetKey]);

  const closeSearch = useCallback(() => {
    resetField();
    buttonRef.current?.focus();
  }, [resetField]);

  const handleToggle = useCallback(
    (pressed: boolean) => {
      if (pressed) {
        setIsOpen(true);
      } else {
        // Closing from the toggle itself: it already holds focus.
        resetField();
      }
    },
    [resetField],
  );

  // Close the panel when focus leaves both the toggle button and the panel itself.
  // Implemented at document level (not via onBlur on the panel <div>) so the panel
  // stays semantically non-interactive.
  useEffect(() => {
    if (!isOpen) return;
    const handleFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!next) return;
      if (buttonRef.current?.contains(next)) return;
      if (panelRef.current?.contains(next)) return;
      // State only. `next` is where the participant is going; see resetField.
      resetField();
    };
    document.addEventListener('focusout', handleFocusOut);
    return () => document.removeEventListener('focusout', handleFocusOut);
  }, [isOpen, resetField]);

  const handleClear = useCallback(() => {
    setStatusMessage('');
    clear();
    inputRef.current?.focus();
  }, [clear]);

  /**
   * The status describes the OUTCOME of the last search, so a new query makes
   * it stale. Clearing it first also means a repeated outcome — two empty
   * searches in a row — changes the region's content twice and is announced
   * again, rather than sitting there unchanged and silent.
   */
  const handleSearchQueryChange = useCallback(
    (value: string | undefined) => {
      setStatusMessage('');
      handleQueryChange(value);
    },
    [handleQueryChange],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSearch();
      } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
        // Move focus to the first suggestion
        e.preventDefault();
        const firstOption = panelRef.current?.querySelector('[role="option"]');
        if (firstOption instanceof HTMLElement) {
          firstOption.focus();
        }
      } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
        // Move focus to the last suggestion
        e.preventDefault();
        const options = panelRef.current?.querySelectorAll('[role="option"]');
        const lastOption = options?.[options.length - 1];
        if (lastOption instanceof HTMLElement) {
          lastOption.focus();
        }
      }
    },
    [closeSearch, suggestions.length],
  );

  // Memoized extractors following Collection patterns
  const keyExtractor = useCallback(
    (item: SuggestionItem) => item.mapbox_id,
    [],
  );

  const textValueExtractor = useCallback(
    (item: SuggestionItem) => item.name,
    [],
  );

  /**
   * Click handler factory - returns a handler for each suggestion.
   *
   * The panel closes and focus returns immediately; the announcement lands
   * when the retrieve settles. Waiting for the network before closing would
   * leave the participant holding an open panel on a slow connection, and an
   * open one on failure.
   */
  const handleSuggestionClick = useCallback(
    (suggestion: SuggestionItem) => () => {
      const generation = (selectionGenerationRef.current += 1);
      void handleSelect(suggestion).then((outcome) => {
        // A newer selection, or a move to another node, has taken over since
        // this one was made. Saying anything now would describe a map the
        // participant is no longer looking at.
        if (selectionGenerationRef.current !== generation) return;
        setStatusMessage(
          outcome === 'moved'
            ? movedMessage(suggestion.name)
            : RETRIEVE_FAILED_MESSAGE,
        );
      });
      closeSearch();
    },
    [handleSelect, closeSearch],
  );

  // KeyDown handler factory for suggestions
  const handleSuggestionKeyDown = useCallback(
    (item: SuggestionItem) => (e: React.KeyboardEvent) => {
      const clickHandler = handleSuggestionClick(item);

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        clickHandler();
      } else if (e.key === 'Escape') {
        closeSearch();
      } else if (e.key === 'ArrowUp') {
        // Check if this is the first option - if so, return to input
        const options = panelRef.current?.querySelectorAll('[role="option"]');
        const firstOption = options?.[0];
        if (e.currentTarget === firstOption) {
          e.preventDefault();
          inputRef.current?.focus();
        }
        // Otherwise let Collection handle navigation
      } else if (e.key === 'ArrowDown') {
        // Check if this is the last option - if so, cycle to input
        const options = panelRef.current?.querySelectorAll('[role="option"]');
        const lastOption = options?.[options.length - 1];
        if (e.currentTarget === lastOption) {
          e.preventDefault();
          inputRef.current?.focus();
        }
        // Otherwise let Collection handle navigation
      }
    },
    [handleSuggestionClick, closeSearch],
  );

  // Memoized renderItem following OneToManyDyadCensus pattern
  const renderItem = useCallback(
    (item: SuggestionItem, itemProps: ItemProps) => (
      <div
        {...itemProps}
        role="option"
        aria-selected={false}
        tabIndex={0}
        onMouseDown={preventBlur}
        onClick={handleSuggestionClick(item)}
        onKeyDown={handleSuggestionKeyDown(item)}
        className={cx(
          'flex cursor-pointer flex-col gap-0.5 px-3 py-2',
          'transition-colors outline-none',
          'hover:bg-accent/10 data-focused:bg-accent/10',
        )}
      >
        <span className="text-sm">{item.name}</span>
        {item.place_formatted && (
          <span className="text-xs">{item.place_formatted}</span>
        )}
      </div>
    ),
    [handleSuggestionClick, handleSuggestionKeyDown],
  );

  /**
   * A query that has finished searching without producing a list. Kept
   * distinct from "not searching yet" so the participant is told the search
   * ran, instead of being left with a panel that shows nothing at all and says
   * nothing either — and split by WHY it produced nothing, because a request
   * that never reached Mapbox has not established that anything failed to
   * match.
   */
  const hasSettledEmpty =
    query.trim().length > 0 && !isLoading && suggestions.length === 0;
  const settledMessage = !hasSettledEmpty
    ? null
    : searchFailed
      ? SEARCH_FAILED_MESSAGE
      : NO_RESULTS_MESSAGE;

  useEffect(() => {
    if (!settledMessage) return;
    setStatusMessage(settledMessage);
  }, [settledMessage]);

  const showSuggestions =
    suggestions.length > 0 || isLoading || hasSettledEmpty;

  return (
    <motion.div
      className={cx('flex items-center gap-2', className)}
      variants={searchContainerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/*
        Always mounted, outside the panel, message or not. A screen reader only
        announces changes to a region it was already observing, so a region
        that arrives with its first message is announced late or not at all —
        and one living inside the panel would be torn down by the very
        selection it needs to report.
      */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="geospatial-search-status"
      >
        {statusMessage}
      </div>

      <Toggle
        pressed={isOpen}
        onPressedChange={handleToggle}
        render={
          <IconButton
            ref={buttonRef}
            icon={<Search />}
            color={isOpen ? 'secondary' : 'dynamic'}
            aria-label={isOpen ? 'Close search' : 'Search location'}
            aria-expanded={isOpen}
            data-testid="geospatial-search-toggle"
            className="relative"
            size="lg"
          />
        }
      />

      {/* Search panel - appears to right of toggle */}
      <AnimatePresence>
        {isOpen && (
          <div ref={panelRef} className="relative">
            <MotionSurface
              noContainer
              spacing="none"
              shadow="none"
              className="bg-surface/80 w-sm rounded-xl shadow-md backdrop-blur-md"
              initial={{ opacity: 0, x: '-2rem' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '-2rem' }}
            >
              <InputField
                ref={inputRef}
                type="text"
                autoFocus
                placeholder="Search for a place..."
                value={query}
                onChange={handleSearchQueryChange}
                onKeyDown={handleInputKeyDown}
                data-testid="geospatial-search-input"
                // ARIA combobox attributes
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-haspopup="listbox"
                suffixComponent={
                  query ? (
                    <IconButton
                      icon={<X />}
                      variant="text"
                      size="sm"
                      onClick={handleClear}
                      aria-label="Clear search"
                      data-testid="geospatial-search-clear"
                      tabIndex={-1}
                    />
                  ) : undefined
                }
              />
            </MotionSurface>

            {/* Suggestions dropdown */}
            <AnimatePresence>
              {showSuggestions && (
                <MotionSurface
                  noContainer
                  spacing="none"
                  shadow="none"
                  floating
                  className="absolute left-0 mt-2 flex max-h-64 w-sm flex-col shadow-xl"
                  initial={{ opacity: 0, y: '-0.5rem' }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: '-0.5rem' }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  {suggestions.length > 0 ? (
                    <Collection
                      id={listboxId}
                      items={suggestions as SuggestionItem[]}
                      layout={layout}
                      keyExtractor={keyExtractor}
                      textValueExtractor={textValueExtractor}
                      selectionMode="none"
                      animate={false}
                      aria-label="Search suggestions"
                      className="flex flex-col p-1"
                      renderItem={renderItem}
                    >
                      {(CollectionElements) => CollectionElements}
                    </Collection>
                  ) : (
                    /*
                      Nothing to list yet — but the popup still carries the
                      listbox identity, because the combobox above points
                      `aria-controls` at it for as long as it reports itself
                      expanded. The states with no Collection used to leave
                      that reference dangling.
                    */
                    <div
                      id={listboxId}
                      role="listbox"
                      aria-label="Search suggestions"
                      aria-busy={isLoading || undefined}
                      data-testid="geospatial-search-empty"
                      className={cx(
                        'p-4 text-center text-sm',
                        isLoading && 'italic',
                      )}
                    >
                      {isLoading
                        ? 'Searching...'
                        : (settledMessage ?? NO_RESULTS_MESSAGE)}
                    </div>
                  )}
                </MotionSurface>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
