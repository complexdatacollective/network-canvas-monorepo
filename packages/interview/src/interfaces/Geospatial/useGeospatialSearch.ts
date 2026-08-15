import { useSearchBoxCore } from '@mapbox/search-js-react';
import { debounce } from 'es-toolkit';
import type { Map as MapboxMap } from 'mapbox-gl/esm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Zoom level when flying to a selected location
const FLY_TO_ZOOM = 14;

// Infer the suggestion type from the SearchBoxCore API to avoid importing
// from @mapbox/search-js-core (which pnpm doesn't hoist to top-level).
type SearchBoxInstance = ReturnType<typeof useSearchBoxCore>;
type SuggestResponse = Awaited<ReturnType<SearchBoxInstance['suggest']>>;
export type Suggestion = SuggestResponse['suggestions'][number];

export type UseGeospatialSearchProps = {
  accessToken: string | null | undefined;
  map: MapboxMap | null;
  proximity?: [number, number];
  /** When this value changes, the search state is reset */
  resetKey?: string | number;
  /**
   * Called once the debounced search query is sent to Mapbox, after the
   * 300ms idle window. The query string itself is intentionally not passed —
   * callers receive only the signal that a search occurred.
   */
  onSearchPerformed?: () => void;
};

/**
 * What selecting a suggestion actually did, so the caller can say so out loud.
 *
 * Derived from whether the camera MOVED — deliberately not from whether
 * `retrieve()` threw. A response carrying no features, or a feature whose
 * geometry is not a point, resolves perfectly happily and moves nothing;
 * announcing "Map moved to …" in that case tells the participant something
 * that did not happen.
 */
export type SelectSuggestionOutcome = 'moved' | 'unavailable';

type UseGeospatialSearchReturn = {
  query: string;
  handleQueryChange: (value: string | undefined) => void;
  suggestions: Suggestion[];
  isLoading: boolean;
  /**
   * The last settled `suggest()` FAILED rather than matching nothing.
   *
   * Same rule as `SelectSuggestionOutcome` above: report what happened. A
   * request that throws — offline (both hosts are offline-first), a rejected
   * token, a rate limit — leaves behind exactly the empty list a genuine
   * zero-result leaves, so a caller reading `suggestions.length === 0` alone
   * would tell the participant their query matched nothing when we have no
   * idea whether it did.
   */
  searchFailed: boolean;
  handleSelect: (suggestion: Suggestion) => Promise<SelectSuggestionOutcome>;
  clear: () => void;
};

// Explicit return-type annotation: without it, tsc infers a type that references
// `SearchBoxSuggestion` from `@mapbox/search-js-core` via a pnpm-mangled path
// that is not portable in the emitted .d.ts.
export const useGeospatialSearch = ({
  accessToken,
  map,
  proximity,
  resetKey,
  onSearchPerformed,
}: UseGeospatialSearchProps): UseGeospatialSearchReturn => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  // UUIDv4 per Mapbox recommendation: https://docs.mapbox.com/api/search/search-box/#get-suggested-results
  // A session is one suggest→retrieve cycle.
  // We rotate the token when a search is explicitly completed, cleared, or reset
  // to avoid unpredictable billing.
  // https://docs.mapbox.com/api/search/search-box/#session-billing
  // Use a state initializer so crypto.randomUUID() is only called once (on mount),
  // not on every render.
  const [initialSessionToken] = useState(() => crypto.randomUUID());
  const sessionTokenRef = useRef(initialSessionToken);

  // Use the hook from @mapbox/search-js-react
  const searchBox = useSearchBoxCore({
    accessToken: accessToken ?? '',
  });

  const searchBoxRef = useRef(searchBox);
  searchBoxRef.current = searchBox;

  const onSearchPerformedRef = useRef(onSearchPerformed);
  onSearchPerformedRef.current = onSearchPerformed;

  const proximityOption = useMemo(
    () => (proximity ? { lng: proximity[0], lat: proximity[1] } : undefined),
    [proximity],
  );

  /**
   * Bumped by every `reset()`. A `suggest()` request already in flight cannot
   * be cancelled — `reset()` can only cancel the debounce timer — so each
   * request remembers the generation it was issued in and drops its response
   * if the field has been reset (or moved to another node via `resetKey`)
   * since. Without this, a slow response repopulates a list the participant
   * has already cleared, and clears the loading state of a query they have
   * since retyped.
   */
  const searchGenerationRef = useRef(0);

  // Create debounced fetch function
  const fetchSuggestions = useMemo(() => {
    if (!accessToken) return null;

    return debounce(async (value: string) => {
      if (!value.trim()) {
        setSuggestions([]);
        setSearchFailed(false);
        setIsLoading(false);
        return;
      }

      onSearchPerformedRef.current?.();

      const generation = searchGenerationRef.current;
      const isStale = () => generation !== searchGenerationRef.current;

      try {
        const response = await searchBoxRef.current.suggest(value, {
          sessionToken: sessionTokenRef.current,
          proximity: proximityOption,
        });
        if (isStale()) return;
        setSuggestions(response.suggestions);
        setSearchFailed(false);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Search error:', error);
        if (isStale()) return;
        setSuggestions([]);
        // The empty list this leaves behind is the same one a genuine
        // zero-result leaves, so the failure has to be recorded separately or
        // the caller cannot help but claim nothing matched.
        setSearchFailed(true);
      } finally {
        if (!isStale()) {
          setIsLoading(false);
        }
      }
    }, 300);
  }, [accessToken, proximityOption]);

  const fetchSuggestionsRef = useRef(fetchSuggestions);
  fetchSuggestionsRef.current = fetchSuggestions;

  const reset = useCallback(() => {
    fetchSuggestionsRef.current?.cancel();
    searchGenerationRef.current += 1;
    sessionTokenRef.current = crypto.randomUUID();
    setQuery('');
    setSuggestions([]);
    setSearchFailed(false);
    setIsLoading(false);
  }, []);

  // Clear state when resetKey changes
  useEffect(() => {
    reset();
  }, [resetKey, reset]);

  // Cancel pending debounced fetch when fetchSuggestions changes (new instance
  // created because accessToken/proximityOption changed) or on unmount.
  // This prevents a stale debounce timer from updating state with old results.
  useEffect(() => {
    return () => {
      fetchSuggestions?.cancel();
    };
  }, [fetchSuggestions]);

  const handleQueryChange = useCallback(
    (value: string | undefined) => {
      const safeValue = value ?? '';
      setQuery(safeValue);
      if (safeValue.trim()) {
        setIsLoading(true);
        fetchSuggestions?.(safeValue);
      } else {
        setSuggestions([]);
        setSearchFailed(false);
        setIsLoading(false);
      }
    },
    [fetchSuggestions],
  );

  /**
   * Retrieve coordinates and fly to the location, reporting whether the camera
   * actually moved.
   *
   * Only the session TOKEN is rotated once the retrieve settles — a
   * suggest→retrieve cycle is one billable session, and this one is now spent.
   * The whole-field `reset()` this used to call ran AFTER the await, so a
   * selection settling late wiped a query the participant had already typed
   * into a reopened panel. Closing the panel is the caller's job, and it does
   * it synchronously.
   */
  const handleSelect = useCallback(
    async (suggestion: Suggestion): Promise<SelectSuggestionOutcome> => {
      if (!accessToken || !map) return 'unavailable';

      try {
        const result = await searchBoxRef.current.retrieve(suggestion, {
          sessionToken: sessionTokenRef.current,
        });
        const feature = result.features[0];
        if (feature?.geometry.type !== 'Point') return 'unavailable';

        const [lng, lat] = feature.geometry.coordinates as [number, number];
        map.flyTo({ center: [lng, lat], zoom: FLY_TO_ZOOM });
        return 'moved';
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Retrieve error:', error);
        return 'unavailable';
      } finally {
        sessionTokenRef.current = crypto.randomUUID();
      }
    },
    [map, accessToken],
  );

  const clear = reset;

  return {
    query,
    handleQueryChange,
    suggestions,
    isLoading,
    searchFailed,
    handleSelect,
    clear,
  };
};
