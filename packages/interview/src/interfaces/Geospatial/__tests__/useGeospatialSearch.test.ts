import {
  act,
  renderHook as renderHookBase,
  type RenderHookOptions,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks (must appear before imports that use them) ---

type SuggestOptions = {
  sessionToken: string;
  proximity?: unknown;
  language?: string;
};
const mockSuggest = vi
  .fn<
    (
      query: string,
      options: SuggestOptions,
    ) => Promise<{ suggestions: unknown[] }>
  >()
  .mockResolvedValue({ suggestions: [] });
const mockRetrieve = vi
  .fn<
    (
      suggestion: unknown,
      options: { sessionToken: string; language?: string },
    ) => Promise<{
      features: { geometry: { type: string; coordinates: number[] } }[];
    }>
  >()
  .mockResolvedValue({ features: [] });

vi.mock('@mapbox/search-js-react', () => ({
  useSearchBoxCore: () => ({ suggest: mockSuggest, retrieve: mockRetrieve }),
}));

// Make debounce synchronous with a trackable `cancel` so tests can assert on it
const mockCancel = vi.fn();
vi.mock('es-toolkit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('es-toolkit')>()),
  debounce: (fn: (...args: unknown[]) => unknown) => {
    const wrapped = (...args: unknown[]) => fn(...args);
    wrapped.cancel = mockCancel;
    return wrapped;
  },
}));

// The hook under test (imported after mocks are declared)
import type { Map as MapboxMap } from 'mapbox-gl/esm';

import { type Suggestion, useGeospatialSearch } from '../useGeospatialSearch';
import { Languages, setLanguages } from './Languages';

// Every hook here runs inside a protocol localization, as it does in the Shell.
const renderHook = <Result, Props>(
  render: (initialProps: Props) => Result,
  options?: RenderHookOptions<Props>,
) => renderHookBase(render, { wrapper: Languages, ...options });

// Minimal Map stub (only flyTo is called by the hook)
const mockFlyTo = vi.fn();
const mockMap = { flyTo: mockFlyTo } as unknown as MapboxMap;

// ---------------------------------------------------------------------------

describe('useGeospatialSearch', () => {
  let uuidCallCount = 0;

  beforeEach(() => {
    uuidCallCount = 0;
    // Provide a deterministic, incrementing UUID so we can assert token identity
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `session-token-${++uuidCallCount}`),
    });
    mockSuggest.mockClear().mockResolvedValue({ suggestions: [] });
    mockRetrieve.mockClear().mockResolvedValue({ features: [] });
    mockCancel.mockClear();
    mockFlyTo.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // handleQueryChange's debounced fetch awaits suggest(), so its trailing
  // setSuggestions/setIsLoading run in a microtask after the synchronous act()
  // returns. Draining that microtask inside act() keeps those updates wrapped
  // rather than firing outside act() once the test ends.
  const flushPendingSuggest = () =>
    act(async () => {
      await Promise.resolve();
    });

  // -------------------------------------------------------------------------
  // Session token stability
  // -------------------------------------------------------------------------

  describe('session token stability', () => {
    it('uses the same session token for multiple suggest() calls within one session', async () => {
      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      // mockSuggest is called synchronously before the internal `await`, so
      // mock.calls is populated inside the sync act() block.
      act(() => {
        result.current.handleQueryChange('new york');
      });
      act(() => {
        result.current.handleQueryChange('new york city');
      });

      expect(mockSuggest).toHaveBeenCalledTimes(2);
      const firstToken = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      const secondToken = mockSuggest.mock.calls[1]?.[1]?.sessionToken;
      expect(firstToken).toBeDefined();
      expect(firstToken).toBe(secondToken);

      await flushPendingSuggest();
    });
  });

  // -------------------------------------------------------------------------
  // Session token rotation
  // -------------------------------------------------------------------------

  describe('session token rotation', () => {
    it('rotates token and cancels pending debounce when resetKey changes', async () => {
      const { result, rerender } = renderHook(
        ({ resetKey }: { resetKey: string }) =>
          useGeospatialSearch({
            accessToken: 'test-token',
            map: mockMap,
            resetKey,
          }),
        { initialProps: { resetKey: 'key-1' } },
      );

      act(() => {
        result.current.handleQueryChange('paris');
      });

      const tokenBefore = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      mockSuggest.mockClear();
      mockCancel.mockClear();

      act(() => {
        rerender({ resetKey: 'key-2' });
      });

      act(() => {
        result.current.handleQueryChange('london');
      });

      const tokenAfter = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      expect(tokenAfter).toBeDefined();
      expect(tokenAfter).not.toBe(tokenBefore);
      expect(mockCancel).toHaveBeenCalled();

      await flushPendingSuggest();
    });

    it('rotates token and cancels pending debounce on clear()', async () => {
      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      act(() => {
        result.current.handleQueryChange('berlin');
      });

      const tokenBefore = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      mockSuggest.mockClear();
      mockCancel.mockClear();

      act(() => {
        result.current.clear();
      });

      act(() => {
        result.current.handleQueryChange('tokyo');
      });

      const tokenAfter = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      expect(tokenAfter).toBeDefined();
      expect(tokenAfter).not.toBe(tokenBefore);
      expect(mockCancel).toHaveBeenCalled();

      await flushPendingSuggest();
    });

    // A suggest→retrieve cycle is one billable session, so the token still
    // rotates when a selection settles. What no longer happens is the whole
    // field being reset from inside handleSelect: that reset ran AFTER the
    // await, so a selection settling late wiped a query the participant had
    // already typed into a reopened panel. Closing is the caller's job.
    it('rotates the session token on handleSelect() without resetting the field', async () => {
      mockRetrieve.mockResolvedValueOnce({
        features: [{ geometry: { type: 'Point', coordinates: [13.4, 52.5] } }],
      });
      mockSuggest.mockResolvedValue({
        suggestions: [],
      } as unknown as { suggestions: [] });

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      act(() => {
        result.current.handleQueryChange('berlin');
      });
      await flushPendingSuggest();

      const tokenBefore = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      mockSuggest.mockClear();
      mockCancel.mockClear();

      await act(async () => {
        await result.current.handleSelect({
          mapbox_id: 'some-id',
        } as unknown as Suggestion);
      });

      expect(result.current.query).toBe('berlin');
      expect(mockCancel).not.toHaveBeenCalled();

      act(() => {
        result.current.handleQueryChange('paris');
      });

      const tokenAfter = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      expect(tokenAfter).toBeDefined();
      expect(tokenAfter).not.toBe(tokenBefore);

      await flushPendingSuggest();
    });

    // It rotates only the token it SPENT. A participant who picks a result,
    // reopens search and starts typing is on a new session before the first
    // retrieve() has come back over the network; rotating again on the way out
    // would leave the reopened search's suggest() and its eventual retrieve()
    // quoting different tokens — two billed sessions for one lookup, and not
    // the suggest→retrieve pairing Mapbox is being told about.
    it('leaves a reopened search on its own session token when an earlier retrieve settles', async () => {
      let settleFirstRetrieve: (() => void) | undefined;
      mockRetrieve.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleFirstRetrieve = () => resolve({ features: [] });
          }),
      );

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      act(() => {
        result.current.handleQueryChange('berlin');
      });
      await flushPendingSuggest();

      let firstSelection: Promise<unknown> | undefined;
      act(() => {
        firstSelection = result.current.handleSelect({
          mapbox_id: 'berlin-id',
        } as unknown as Suggestion);
      });

      // The panel closes and the participant reopens it and types again, all
      // while that first retrieve is still in flight.
      act(() => {
        result.current.clear();
      });
      mockSuggest.mockClear();
      act(() => {
        result.current.handleQueryChange('paris');
      });
      const reopenedToken = mockSuggest.mock.calls[0]?.[1]?.sessionToken;
      expect(reopenedToken).toBeDefined();
      await flushPendingSuggest();

      // Only now does the first retrieve come back.
      await act(async () => {
        settleFirstRetrieve?.();
        await firstSelection;
      });

      mockRetrieve.mockClear();
      await act(async () => {
        await result.current.handleSelect({
          mapbox_id: 'paris-id',
        } as unknown as Suggestion);
      });

      expect(mockRetrieve.mock.calls[0]?.[1]?.sessionToken).toBe(reopenedToken);
    });
  });

  // -------------------------------------------------------------------------
  // Selection outcome
  // -------------------------------------------------------------------------

  describe('selection outcome', () => {
    const select = async (
      result: { current: ReturnType<typeof useGeospatialSearch> },
      outcomeBox: { value?: string },
    ) => {
      await act(async () => {
        outcomeBox.value = await result.current.handleSelect({
          mapbox_id: 'some-id',
        } as unknown as Suggestion);
      });
    };

    it('reports "moved" only when the camera actually moved', async () => {
      mockRetrieve.mockResolvedValueOnce({
        features: [{ geometry: { type: 'Point', coordinates: [13.4, 52.5] } }],
      });

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      const outcome: { value?: string } = {};
      await select(result, outcome);

      expect(outcome.value).toBe('moved');
      expect(mockFlyTo).toHaveBeenCalledTimes(1);
    });

    // A response carrying nothing usable resolves happily, so an outcome
    // derived from the catch block would claim a move that never happened.
    it('reports "unavailable" when the response holds no point geometry', async () => {
      mockRetrieve.mockResolvedValueOnce({ features: [] });

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      const outcome: { value?: string } = {};
      await select(result, outcome);

      expect(outcome.value).toBe('unavailable');
    });

    it('reports "unavailable" when the retrieve fails', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mockRetrieve.mockRejectedValueOnce(new Error('network down'));

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      const outcome: { value?: string } = {};
      await select(result, outcome);

      expect(outcome.value).toBe('unavailable');
      consoleError.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Suggest failures
  // -------------------------------------------------------------------------

  describe('suggest failures', () => {
    // The empty list a failed request leaves is byte-identical to the one a
    // genuine zero-result leaves, so the failure has to be reported on its own
    // channel or the caller cannot avoid claiming nothing matched.
    it('separates a failed search from one that matched nothing', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mockSuggest.mockRejectedValueOnce(new Error('offline'));

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      act(() => {
        result.current.handleQueryChange('berlin');
      });
      await flushPendingSuggest();

      expect(result.current.searchFailed).toBe(true);
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.isLoading).toBe(false);

      // A search that reaches Mapbox and comes back empty is not a failure.
      act(() => {
        result.current.handleQueryChange('berlin!');
      });
      await flushPendingSuggest();

      expect(result.current.searchFailed).toBe(false);
      expect(result.current.suggestions).toEqual([]);
      consoleError.mockRestore();
    });

    it('drops the failure when the field is cleared', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mockSuggest.mockRejectedValueOnce(new Error('offline'));

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      act(() => {
        result.current.handleQueryChange('berlin');
      });
      await flushPendingSuggest();
      expect(result.current.searchFailed).toBe(true);

      act(() => {
        result.current.clear();
      });

      expect(result.current.searchFailed).toBe(false);
      consoleError.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Late responses
  // -------------------------------------------------------------------------

  describe('late responses', () => {
    // `reset()` can cancel the debounce timer but cannot abort a request
    // already in flight, so the response has to be dropped on arrival.
    it('discards a suggest response that lands after the field was cleared', async () => {
      let resolveSuggest: ((value: { suggestions: [] }) => void) | undefined;
      mockSuggest.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSuggest = resolve;
          }),
      );

      const { result } = renderHook(() =>
        useGeospatialSearch({ accessToken: 'test-token', map: mockMap }),
      );

      act(() => {
        result.current.handleQueryChange('berlin');
      });
      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.clear();
      });

      await act(async () => {
        resolveSuggest?.({
          suggestions: [{ mapbox_id: 'late', name: 'Late' }],
        } as unknown as { suggestions: [] });
        await Promise.resolve();
      });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.query).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Stale debounce cancellation
  // -------------------------------------------------------------------------

  describe('stale debounce cancellation', () => {
    it('cancels the previous fetchSuggestions instance when accessToken changes', () => {
      const { rerender, unmount } = renderHook(
        ({ accessToken }: { accessToken: string }) =>
          useGeospatialSearch({ accessToken, map: mockMap }),
        { initialProps: { accessToken: 'token-1' } },
      );

      // Clear any cancel calls that may have occurred during initial setup
      mockCancel.mockClear();

      act(() => {
        rerender({ accessToken: 'token-2' });
      });

      // The useEffect cleanup for the old fetchSuggestions should cancel it
      expect(mockCancel).toHaveBeenCalled();
      unmount();
    });
  });

  // -------------------------------------------------------------------------
  // Language
  // -------------------------------------------------------------------------

  describe('language', () => {
    const useSearch = () =>
      useGeospatialSearch({ accessToken: 'test-token', map: mockMap });

    beforeEach(() => {
      setLanguages('en');
    });

    it('asks suggest() and retrieve() in the protocol language', async () => {
      setLanguages('hu');
      mockRetrieve.mockResolvedValue({
        features: [{ geometry: { type: 'Point', coordinates: [19, 47] } }],
      });
      const { result } = renderHook(useSearch);

      act(() => {
        result.current.handleQueryChange('Budapest');
      });
      await flushPendingSuggest();
      await act(async () => {
        await result.current.handleSelect({} as Suggestion);
      });

      expect(mockSuggest.mock.calls[0]?.[1]?.language).toBe('hu');
      expect(mockRetrieve.mock.calls[0]?.[1]?.language).toBe('hu');
    });

    it('sends the language Search Box lists for a regional protocol language', async () => {
      setLanguages('pt-BR');
      const { result } = renderHook(useSearch);

      act(() => {
        result.current.handleQueryChange('Lisboa');
      });
      await flushPendingSuggest();

      expect(mockSuggest.mock.calls[0]?.[1]?.language).toBe('pt');
    });

    it('uses the interface language when Search Box lacks the protocol language', async () => {
      // Search Box has no Chinese, but the interface is in German.
      setLanguages('zh-Hans', 'de');
      const { result } = renderHook(useSearch);

      act(() => {
        result.current.handleQueryChange('Berlin');
      });
      await flushPendingSuggest();

      expect(mockSuggest.mock.calls[0]?.[1]?.language).toBe('de');
    });

    it('uses English when Search Box has neither language', async () => {
      // No Search Box support for Swahili or for a Chinese interface.
      setLanguages('sw', 'zh-Hans');
      const { result } = renderHook(useSearch);

      act(() => {
        result.current.handleQueryChange('Nairobi');
      });
      await flushPendingSuggest();

      expect(mockSuggest.mock.calls[0]?.[1]?.language).toBe('en');
    });

    it('drops suggestions in the old language and asks again in the new one', async () => {
      const englishSuggestion = { name: 'Hungary' } as unknown as Suggestion;
      const hungarianSuggestion = {
        name: 'Magyarország',
      } as unknown as Suggestion;
      mockSuggest.mockImplementation((_query, { language }) =>
        Promise.resolve({
          suggestions: [
            language === 'hu' ? hungarianSuggestion : englishSuggestion,
          ] as never,
        }),
      );
      const { result, rerender } = renderHook(useSearch);

      act(() => {
        result.current.handleQueryChange('hungary');
      });
      await flushPendingSuggest();
      expect(result.current.suggestions).toEqual([englishSuggestion]);

      setLanguages('hu');
      rerender();
      // The old-language list is gone before the new request settles.
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.query).toBe('hungary');
      expect(result.current.isLoading).toBe(true);
      await flushPendingSuggest();

      expect(mockSuggest).toHaveBeenCalledTimes(2);
      expect(mockSuggest.mock.calls[1]?.[0]).toBe('hungary');
      expect(mockSuggest.mock.calls[1]?.[1]?.language).toBe('hu');
      expect(result.current.suggestions).toEqual([hungarianSuggestion]);
      expect(result.current.isLoading).toBe(false);
    });

    it('discards a response still in flight in the old language', async () => {
      let settleEnglish: (value: { suggestions: unknown[] }) => void = () => {};
      mockSuggest.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleEnglish = resolve;
          }),
      );
      const { result, rerender } = renderHook(useSearch);

      act(() => {
        result.current.handleQueryChange('hungary');
      });
      setLanguages('hu');
      rerender();
      await act(async () => {
        settleEnglish({ suggestions: [{ name: 'Hungary' }] });
        await Promise.resolve();
      });

      expect(result.current.suggestions).not.toContainEqual({
        name: 'Hungary',
      });
    });

    it('does not ask again when the language is unchanged or nothing is typed', async () => {
      const { result, rerender } = renderHook(useSearch);

      rerender();
      setLanguages('hu');
      rerender();
      await flushPendingSuggest();
      expect(result.current.query).toBe('');
      expect(mockSuggest).not.toHaveBeenCalled();

      act(() => {
        result.current.handleQueryChange('budapest');
      });
      await flushPendingSuggest();
      rerender();
      await flushPendingSuggest();

      expect(mockSuggest).toHaveBeenCalledTimes(1);
    });
  });
});
