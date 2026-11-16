import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  createCatalogSource,
  ecosystemLocales,
} from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { frescoUiCatalogLoaders } from './locales/catalogs';
import TimeAgo from './TimeAgo';

const MINUTE_MS = 60000;
const DAY_MS = 86400000;

const catalogs = createCatalogSource(frescoUiCatalogLoaders);
await catalogs.load('es');

// Captures the rendered text at every React commit: the flicker this guards
// against was the first committed frame being empty (NoSSRWrapper's mount
// gate, then TimeAgo's effect-derived state), which made the element's width
// jump on every mount — visibly, whenever a table cell re-rendered.
function renderCapturingCommits(ui: React.ReactElement) {
  const commits: (string | null)[] = [];
  render(
    <Profiler
      id="time-ago-commits"
      onRender={() => {
        commits.push(screen.queryByTestId('time-ago')?.textContent ?? null);
      }}
    >
      {ui}
    </Profiler>,
  );
  return commits;
}

describe('TimeAgo', () => {
  it('changes relative and absolute timestamps with the app language', async () => {
    const date = new Date(Date.now() - 2 * DAY_MS);
    const view = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={catalogs.peek(locale)}
      >
        <TimeAgo date={date} />
      </AppI18nProvider>
    );
    const { rerender } = render(view('en'));
    expect(screen.getByRole('button')).toHaveTextContent('2 days ago');
    rerender(view('es'));
    expect(screen.getByRole('button')).toHaveTextContent('hace 2 días');
    const time = screen.getByRole('button').querySelector('time');
    expect(time).toBeInTheDocument();
    expect(time).toHaveAttribute('datetime', date.toISOString());
    const absolute = new Intl.DateTimeFormat('es', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
    expect(time).toHaveAttribute('title', absolute);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button')).toHaveTextContent(absolute);
  });

  it('translates the less-than-one-minute timestamp', () => {
    render(
      <AppI18nProvider
        locale="es"
        locales={ecosystemLocales}
        messages={catalogs.peek('es')}
      >
        <TimeAgo date={new Date(Date.now() - 30_000)} />
      </AppI18nProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('ahora mismo');
  });

  it('renders the relative time in the very first commit', () => {
    const commits = renderCapturingCommits(
      <TimeAgo date={new Date(Date.now() - 2 * DAY_MS)} />,
    );

    expect(commits[0]).toBe('2 days ago');
    // No commit ever showed an empty or missing element.
    expect(commits).not.toContain(null);
    expect(commits).not.toContain('');
  });

  it.each([
    { offsetMs: 30000, expected: 'just now' },
    { offsetMs: 60000, expected: '1 minute ago' },
    { offsetMs: 25 * 60000, expected: '25 minutes ago' },
    { offsetMs: 3600000, expected: '1 hour ago' },
    { offsetMs: 5 * 3600000, expected: '5 hours ago' },
    { offsetMs: DAY_MS, expected: '1 day ago' },
    { offsetMs: 6 * DAY_MS, expected: '6 days ago' },
  ])(
    'renders "$expected" for an offset of $offsetMs ms',
    ({ offsetMs, expected }) => {
      render(<TimeAgo date={new Date(Date.now() - offsetMs)} />);
      expect(screen.getByTestId('time-ago')).toHaveTextContent(expected);
    },
  );

  // Dates are built from local fields so the formatted string does not depend
  // on the machine's time zone.
  it('falls back to the locale-formatted date beyond a week', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 15, 12, 0) });
    try {
      render(<TimeAgo date={new Date(2026, 2, 1, 9, 30)} />);

      expect(screen.getByTestId('time-ago')).toHaveTextContent(
        '3/1/2026, 9:30 AM',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('toggles to the raw timestamp on click', async () => {
    vi.useFakeTimers({
      now: new Date(2026, 2, 15, 12, 0),
      shouldAdvanceTime: true,
    });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<TimeAgo date={new Date(2026, 2, 13, 9, 30)} />);
      const element = screen.getByTestId('time-ago');

      await user.click(element);
      expect(element).toHaveTextContent('3/13/2026, 9:30 AM');

      await user.click(element);
      expect(element).toHaveTextContent('2 days ago');
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves on from "just now" the moment a minute has passed', () => {
    vi.useFakeTimers();
    try {
      render(<TimeAgo date={new Date(Date.now() - 50_000)} />);
      const element = screen.getByTestId('time-ago');
      expect(element).toHaveTextContent('just now');

      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(element).toHaveTextContent('1 minute ago');

      act(() => {
        vi.advanceTimersByTime(MINUTE_MS);
      });
      expect(element).toHaveTextContent('2 minutes ago');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps time from a new date, not the one it mounted with', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <TimeAgo date={new Date(Date.now() - 5 * MINUTE_MS)} />,
      );
      const element = screen.getByTestId('time-ago');
      expect(element).toHaveTextContent('5 minutes ago');

      rerender(<TimeAgo date={new Date(Date.now() - 20_000)} />);
      expect(element).toHaveTextContent('just now');

      act(() => {
        vi.advanceTimersByTime(40_000);
      });
      expect(element).toHaveTextContent('1 minute ago');
    } finally {
      vi.useRealTimers();
    }
  });
});
