import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.tsx';
import type { JobStatus } from '../shared/api.ts';
import {
  configResponse,
  describeCall,
  jobStatus,
  jsonResponse,
  succeededJob,
} from './fixtures.ts';

// A fake API: config, job creation, and a job that is `finalStatus` on its
// first poll so the flow runs without waiting out the poll interval.
const mockApi = (finalStatus: JobStatus, { openaiAvailable = false } = {}) => {
  const posts: unknown[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const { url, method } = describeCall(input, init);
    if (url === '/api/config')
      return jsonResponse(configResponse(openaiAvailable));
    if (url === '/api/jobs' && method === 'POST') {
      posts.push(JSON.parse(String(init?.body)));
      return jsonResponse({ jobId: 'job-1' });
    }
    if (url === '/api/jobs/job-1') return jsonResponse(finalStatus);
    return jsonResponse({ error: 'unexpected' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, posts };
};

const generateButton = () =>
  screen.getByRole('button', { name: /Generate protocol/ });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Sketch flow', () => {
  it('goes from describe to generating to ready', async () => {
    const api = mockApi(succeededJob());
    render(<App />);

    const textarea = screen.getByRole('textbox', {
      name: 'Describe your study',
    });
    fireEvent.change(textarea, {
      target: {
        value: 'Nurses on a ward name the colleagues they ask for advice.',
      },
    });
    await waitFor(() =>
      expect(generateButton()).toHaveProperty('disabled', false),
    );
    fireEvent.click(generateButton());

    expect(
      await screen.findByRole('heading', { name: 'Sketching your interview' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Generation progress' }),
    ).toBeTruthy();

    const see = await screen.findByRole('button', {
      name: /See your protocol/,
    });
    expect(
      screen.getByRole('heading', { name: 'Your protocol is ready' }),
    ).toBeTruthy();
    expect(screen.getByText('Claude Sonnet 5.5')).toBeTruthy();
    expect(api.posts).toEqual([
      {
        description:
          'Nurses on a ward name the colleagues they ask for advice.',
        provider: 'anthropic',
        tier: 'standard',
      },
    ]);

    fireEvent.click(see);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Friendship and Wellbeing',
      }),
    ).toBeTruthy();
    const chips = within(
      screen.getByRole('list', { name: 'Protocol summary' }),
    );
    expect(chips.getByText('3 stages')).toBeTruthy();
    expect(chips.getByText('1 relationship')).toBeTruthy();
    expect(chips.getByText('1 placeholder roster')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'The interview, stage by stage' }),
    ).toBeTruthy();
    expect(screen.getAllByText('Close friends').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'Designed by Claude Sonnet 5.5 · worded by Claude Haiku 5.5 · 41 s · valid on the first try',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Open in Architect/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Download .netcanvas/ }),
    ).toBeTruthy();
    // ChatGPT has no key in this config.
    expect(screen.queryByRole('button', { name: /Compare with/ })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit the description' }),
    );
    expect(
      (
        await screen.findByRole<HTMLTextAreaElement>('textbox', {
          name: 'Describe your study',
        })
      ).value,
    ).toBe('Nurses on a ward name the colleagues they ask for advice.');
  });

  it('shows the not-a-study notice on the describe screen when refused', async () => {
    mockApi(
      jobStatus({
        status: 'refused',
        refusalHint: 'Tell Sketch who you will interview.',
      }),
    );
    render(<App />);

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Describe your study' }),
      {
        target: { value: 'Write me a poem about autumn leaves' },
      },
    );
    await waitFor(() =>
      expect(generateButton()).toHaveProperty('disabled', false),
    );
    fireEvent.click(generateButton());

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText("That doesn't read like a study yet"),
    ).toBeTruthy();
    expect(
      within(alert).getByText(/Tell Sketch who you will interview\./),
    ).toBeTruthy();
    expect(generateButton()).toHaveProperty('disabled', true);

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Describe your study' }),
      {
        target: {
          value: 'Students name their close friends and who knows whom.',
        },
      },
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(generateButton()).toHaveProperty('disabled', false);
  });

  it('shows a friendly error with a retry when the job fails', async () => {
    const api = mockApi(
      jobStatus({ status: 'failed', error: 'The design model timed out.' }),
    );
    render(<App />);
    await waitFor(() =>
      expect(generateButton()).toHaveProperty('disabled', false),
    );
    fireEvent.click(generateButton());

    expect(
      await screen.findByRole('heading', {
        name: 'Sketch couldn’t finish this one',
      }),
    ).toBeTruthy();
    expect(screen.getByText('The design model timed out.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Sketching your interview' }),
    ).toBeTruthy();
    await waitFor(() => expect(api.posts).toHaveLength(2));
  });

  it('offers compare only when both providers are available', async () => {
    mockApi(succeededJob(), { openaiAvailable: true });
    render(<App />);
    const compare = await screen.findByRole('checkbox', {
      name: 'Run both and compare',
    });
    fireEvent.click(compare);
    expect(
      screen.getByRole('button', { name: /Generate with both/ }),
    ).toBeTruthy();
  });
});
