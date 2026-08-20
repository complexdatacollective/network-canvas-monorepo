'use client';

import { Toggle } from '@base-ui/react';
import { Search, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { cx } from '@codaco/fresco-ui/utils/cva';

const STUB_SUGGESTIONS = [
  { id: 'stub-1', name: 'Stub Suggestion 1', place: 'Test City, Test State' },
  { id: 'stub-2', name: 'Stub Suggestion 2', place: 'Test City, Test State' },
  { id: 'stub-3', name: 'Stub Suggestion 3', place: 'Test City, Test State' },
] as const;

type Props = {
  className?: string;
};

export default function GeospatialStubSearch({ className }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);

  const reset = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  /**
   * Mirrors GeospatialSearch's intentional-close rule: picking a suggestion or
   * pressing Escape closes the panel AND returns focus to the toggle, so a
   * keyboard assertion written against the real component holds here too.
   *
   * The stub deliberately stops there. It has no map and no Mapbox response,
   * so it has no search outcome to announce — a stubbed "Map moved to …" would
   * assert something the fixture never did.
   */
  const closeSearch = useCallback(() => {
    reset();
    buttonRef.current?.focus();
  }, [reset]);

  const handleToggle = useCallback(
    (pressed: boolean) => {
      if (pressed) {
        setIsOpen(true);
      } else {
        // Closing from the toggle itself: it already holds focus.
        reset();
      }
    },
    [reset],
  );

  const handleQueryChange = useCallback((value: string | undefined) => {
    setQuery(value ?? '');
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
  }, []);

  const showSuggestions = query.trim().length > 0;

  return (
    <div className={cx('flex items-center gap-2', className)}>
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
            size="lg"
          />
        }
      />

      {isOpen && (
        <div className="relative">
          <MotionSurface
            noContainer
            spacing="none"
            shadow="none"
            className="bg-surface/80 w-sm rounded-xl shadow-xl backdrop-blur-md"
          >
            <InputField
              type="text"
              autoFocus
              placeholder="Search for a place..."
              value={query}
              onChange={handleQueryChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  closeSearch();
                }
              }}
              data-testid="geospatial-search-input"
              role="combobox"
              aria-label="Search"
              aria-expanded={showSuggestions}
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

          {showSuggestions && (
            <MotionSurface
              noContainer
              spacing="none"
              shadow="none"
              floating
              className="absolute left-0 mt-2 flex max-h-64 w-sm flex-col shadow-xl"
            >
              <div
                role="listbox"
                aria-label="Search suggestions"
                className="flex flex-col p-1"
              >
                {STUB_SUGGESTIONS.map((s) => (
                  <div
                    key={s.id}
                    role="option"
                    aria-selected="false"
                    tabIndex={0}
                    onClick={closeSearch}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        closeSearch();
                      } else if (e.key === 'Escape') {
                        closeSearch();
                      }
                    }}
                    className="hover:bg-accent/10 flex cursor-pointer flex-col gap-0.5 px-3 py-2 transition-colors outline-none"
                  >
                    <span className="text-sm">{s.name}</span>
                    <span className="text-xs">{s.place}</span>
                  </div>
                ))}
              </div>
            </MotionSurface>
          )}
        </div>
      )}
    </div>
  );
}
