import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { describe, expect, it } from 'vitest';

import TimeAgo from './TimeAgo';

const DAY_MS = 86400000;

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

  it('falls back to the locale-formatted date beyond a week', () => {
    const date = new Date(Date.now() - 8 * DAY_MS);
    render(<TimeAgo date={date} />);
    const element = screen.getByTestId('time-ago');
    // The exact string is locale-dependent; it must match the title, which
    // always carries the locale-formatted timestamp.
    expect(element.textContent).toBe(element.getAttribute('title'));
  });

  it('toggles to the raw timestamp on click', async () => {
    const user = userEvent.setup();
    render(<TimeAgo date={new Date(Date.now() - 2 * DAY_MS)} />);
    const element = screen.getByTestId('time-ago');

    await user.click(element);
    expect(element.textContent).toBe(element.getAttribute('title'));

    await user.click(element);
    expect(element).toHaveTextContent('2 days ago');
  });
});
