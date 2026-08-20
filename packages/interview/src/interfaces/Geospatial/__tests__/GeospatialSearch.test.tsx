import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks (must appear before imports that use them) ---

type SuggestResult = {
  suggestions: {
    mapbox_id: string;
    name: string;
    place_formatted?: string;
  }[];
};

const SIDETRACK = {
  mapbox_id: 'id-sidetrack',
  name: 'Sidetrack',
  place_formatted: 'Chicago, Illinois',
};
const SIDEWAYS = {
  mapbox_id: 'id-sideways',
  name: 'Sideways',
  place_formatted: 'Chicago, Illinois',
};

const mockSuggest = vi.fn<(query: string) => Promise<SuggestResult>>();
const mockRetrieve = vi.fn<
  () => Promise<{
    features: { geometry: { type: string; coordinates: number[] } }[];
  }>
>();

vi.mock('@mapbox/search-js-react', () => ({
  useSearchBoxCore: () => ({ suggest: mockSuggest, retrieve: mockRetrieve }),
}));

// Make the debounce synchronous so a typed query reaches `suggest` without
// fake timers fighting userEvent's own scheduling.
vi.mock('es-toolkit', () => ({
  debounce: (fn: (...args: unknown[]) => unknown) => {
    const wrapped = (...args: unknown[]) => fn(...args);
    wrapped.cancel = vi.fn();
    return wrapped;
  },
}));

import type { Map as MapboxMap } from 'mapbox-gl/esm';

import GeospatialSearch from '../GeospatialSearch';

// jsdom has neither, and fresco-ui's Collection/ScrollArea construct both on
// mount. The behaviour under test (focus, announcements) needs neither to do
// anything.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class MockWorker {
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
}

const flyTo = vi.fn();
const mockMap = { flyTo } as unknown as MapboxMap;

/**
 * Renders the search beside a control that follows it in the tab order, the
 * way `Geospatial.tsx` puts the zoom toolbar after the search panel.
 */
const setup = () => {
  const user = userEvent.setup();
  const view = render(
    <>
      <GeospatialSearch accessToken="test-token" map={mockMap} />
      <button type="button">Zoom In</button>
    </>,
  );

  return {
    user,
    view,
    toggle: screen.getByTestId('geospatial-search-toggle'),
    zoomIn: screen.getByRole('button', { name: 'Zoom In' }),
    status: () => screen.getByTestId('geospatial-search-status'),
  };
};

const openAndSearch = async (
  user: ReturnType<typeof userEvent.setup>,
  toggle: HTMLElement,
  query = 'Side',
) => {
  await user.click(toggle);
  const input = await screen.findByTestId('geospatial-search-input');
  await user.type(input, query);
  return input;
};

describe('GeospatialSearch', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('Worker', MockWorker);
    flyTo.mockClear();
    mockSuggest
      .mockReset()
      .mockResolvedValue({ suggestions: [SIDETRACK, SIDEWAYS] });
    mockRetrieve.mockReset().mockResolvedValue({
      features: [{ geometry: { type: 'Point', coordinates: [-87.6, 41.9] } }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('focus on close', () => {
    it('returns focus to the toggle when a suggestion is chosen with Enter', async () => {
      const { user, toggle } = setup();
      const input = await openAndSearch(user, toggle);

      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(2);

      // The filed route: ArrowDown moves focus onto the option itself, so the
      // element holding focus is the one the selection unmounts.
      await user.type(input, '{ArrowDown}');
      expect(options[0]).toHaveFocus();

      await user.keyboard('{Enter}');

      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('returns focus to the toggle when a suggestion is chosen with Space', async () => {
      const { user, toggle } = setup();
      const input = await openAndSearch(user, toggle);

      await screen.findAllByRole('option');
      await user.type(input, '{ArrowDown}');
      await user.keyboard('[Space]');

      expect(toggle).toHaveFocus();
    });

    it('returns focus to the toggle when a suggestion is clicked', async () => {
      const { user, toggle } = setup();
      await openAndSearch(user, toggle);

      const options = await screen.findAllByRole('option');
      await user.click(options[0]!);

      expect(toggle).toHaveFocus();
    });

    it('returns focus to the toggle on Escape from the input', async () => {
      const { user, toggle } = setup();
      const input = await openAndSearch(user, toggle);

      await user.type(input, '{Escape}');

      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('returns focus to the toggle on Escape from a suggestion', async () => {
      const { user, toggle } = setup();
      const input = await openAndSearch(user, toggle);

      await screen.findAllByRole('option');
      await user.type(input, '{ArrowDown}');
      await user.keyboard('{Escape}');

      expect(toggle).toHaveFocus();
    });

    /**
     * The counterpart rule, and the reason focus restoration is NOT folded
     * into `resetField`: closing because focus LEFT must leave focus where the
     * participant sent it. A `.focus()` issued during `focusout` wins over the
     * browser's pending move in Chrome, which would bounce Tab backwards onto
     * the toggle and wipe the query — a defect on the very control this fix is
     * about. jsdom does not reproduce that ordering, so the spy is what makes
     * this test real: it fails the moment anything calls focus() on the toggle
     * from that path.
     */
    it('leaves focus alone when Tab takes it past the panel', async () => {
      const { user, toggle, zoomIn } = setup();
      await openAndSearch(user, toggle);
      await screen.findAllByRole('option');
      const toggleFocus = vi.spyOn(toggle, 'focus');

      // input -> first suggestion -> second suggestion -> out of the panel.
      await user.tab();
      await user.tab();
      await user.tab();

      expect(zoomIn).toHaveFocus();
      expect(toggleFocus).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(toggle).toHaveAttribute('aria-expanded', 'false'),
      );
    });

    it('leaves focus alone when a control outside the panel is clicked', async () => {
      const { user, toggle, zoomIn } = setup();
      await openAndSearch(user, toggle);
      const toggleFocus = vi.spyOn(toggle, 'focus');

      await user.click(zoomIn);

      expect(zoomIn).toHaveFocus();
      expect(toggleFocus).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(toggle).toHaveAttribute('aria-expanded', 'false'),
      );
    });
  });

  describe('announcements', () => {
    it('mounts the live region before it has anything to say', () => {
      const { status } = setup();

      expect(status()).toBeInTheDocument();
      expect(status()).toHaveAttribute('aria-live', 'polite');
      expect(status().textContent).toBe('');
    });

    it('announces the place the map moved to', async () => {
      const { user, toggle, status } = setup();
      await openAndSearch(user, toggle);

      const options = await screen.findAllByRole('option');
      await user.click(options[0]!);

      await waitFor(() =>
        expect(status()).toHaveTextContent('Map moved to Sidetrack.'),
      );
      expect(flyTo).toHaveBeenCalledTimes(1);
    });

    // Both selections are in flight at once — the panel closes on the click,
    // long before the network answers — so they can settle in either order.
    // The one the participant actually ended on is the one the live region has
    // to describe.
    it('does not announce a selection the participant has already replaced', async () => {
      let settleFirstRetrieve: (() => void) | undefined;
      mockRetrieve.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleFirstRetrieve = () =>
              resolve({
                features: [
                  { geometry: { type: 'Point', coordinates: [-87.6, 41.9] } },
                ],
              });
          }),
      );

      const { user, toggle, status } = setup();
      await openAndSearch(user, toggle);
      const firstOptions = await screen.findAllByRole('option');
      await user.click(firstOptions[0]!);

      // Reopen and choose the other place before the first retrieve answers.
      await openAndSearch(user, toggle);
      const secondOptions = await screen.findAllByRole('option');
      await user.click(secondOptions[1]!);
      await waitFor(() =>
        expect(status()).toHaveTextContent('Map moved to Sideways.'),
      );

      // Only now does the abandoned first selection come back.
      settleFirstRetrieve?.();

      await waitFor(() => expect(flyTo).toHaveBeenCalledTimes(2));
      expect(status()).toHaveTextContent('Map moved to Sideways.');
    });

    it('announces a failure instead of a move when the place cannot be retrieved', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mockRetrieve.mockRejectedValueOnce(new Error('network down'));

      const { user, toggle, status } = setup();
      await openAndSearch(user, toggle);

      const options = await screen.findAllByRole('option');
      await user.click(options[0]!);

      await waitFor(() =>
        expect(status()).toHaveTextContent(
          'That place could not be loaded. Try another search.',
        ),
      );
      expect(flyTo).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    /**
     * A retrieve that resolves with nothing usable never throws, so an outcome
     * keyed on the `catch` would claim the map moved when it did not.
     */
    it('announces a failure when the retrieved place has no point geometry', async () => {
      mockRetrieve.mockResolvedValueOnce({ features: [] });

      const { user, toggle, status } = setup();
      await openAndSearch(user, toggle);

      const options = await screen.findAllByRole('option');
      await user.click(options[0]!);

      await waitFor(() =>
        expect(status()).toHaveTextContent(
          'That place could not be loaded. Try another search.',
        ),
      );
      expect(flyTo).not.toHaveBeenCalled();
    });

    /**
     * A `suggest()` that FAILS leaves the same empty list a genuine
     * zero-result leaves, so a message keyed on `suggestions.length === 0`
     * tells a participant who is merely offline — and both hosts are
     * offline-first — that their query matched nothing. Same standard the
     * retrieve path is already held to: report what happened.
     */
    it('says the search failed rather than claiming nothing matched', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mockSuggest.mockRejectedValue(new Error('offline'));

      const { user, toggle, status } = setup();
      await openAndSearch(user, toggle, 'Sidetrack');

      const empty = await screen.findByTestId('geospatial-search-empty');
      await waitFor(() =>
        expect(status()).toHaveTextContent(
          'Search could not be completed. Try again in a moment.',
        ),
      );
      expect(empty).toHaveTextContent(
        'Search could not be completed. Try again in a moment.',
      );
      expect(status()).not.toHaveTextContent('Nothing matched your search.');
      consoleError.mockRestore();
    });

    it('shows and announces an empty result rather than an empty panel', async () => {
      mockSuggest.mockResolvedValue({ suggestions: [] });

      const { user, toggle, status } = setup();
      await openAndSearch(user, toggle, 'zzzqqq');

      const empty = await screen.findByTestId('geospatial-search-empty');
      expect(empty).toHaveTextContent('Nothing matched your search.');
      await waitFor(() =>
        expect(status()).toHaveTextContent('Nothing matched your search.'),
      );
    });
  });

  describe('combobox wiring', () => {
    it('points aria-controls at a listbox in every state the popup can be in', async () => {
      const { user, toggle } = setup();
      const input = await openAndSearch(user, toggle);

      const resolveControlledPopup = () => {
        const id = input.getAttribute('aria-controls');
        expect(id).toBeTruthy();
        // The popup is only claimed to exist while the combobox says so.
        if (input.getAttribute('aria-expanded') !== 'true') return null;
        return document.getElementById(id!);
      };

      const withResults = resolveControlledPopup();
      expect(withResults).not.toBeNull();
      expect(within(withResults!).getAllByRole('option')).toHaveLength(2);

      mockSuggest.mockResolvedValue({ suggestions: [] });
      await user.clear(input);
      await user.type(input, 'zzzqqq');
      await screen.findByTestId('geospatial-search-empty');

      const whenEmpty = resolveControlledPopup();
      expect(whenEmpty).not.toBeNull();
      expect(whenEmpty).toHaveAttribute('role', 'listbox');
    });
  });
});
