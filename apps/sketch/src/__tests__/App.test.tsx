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

const question = (n: number) =>
  screen.getByRole<HTMLTextAreaElement>('textbox', {
    name: `Research question ${n}`,
  });
const synopsis = () =>
  screen.getByRole<HTMLTextAreaElement>('textbox', { name: /Study synopsis/ });

const population = () =>
  screen.getByRole<HTMLTextAreaElement>('textbox', {
    name: 'Research population',
  });

const enterStudy = (
  questions: string[],
  text = '',
  who = 'Adults in the study setting',
) => {
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  questions.forEach((value, index) => {
    if (index > 0)
      fireEvent.click(
        screen.getByRole('button', { name: /Add a research question/ }),
      );
    fireEvent.change(question(index + 1), { target: { value } });
  });
  fireEvent.change(population(), { target: { value: who } });
  fireEvent.change(synopsis(), { target: { value: text } });
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

    enterStudy(
      [
        'Which nurses are central in the ward advice network?',
        'Do advice ties cross shift boundaries?',
      ],
      'A sociocentric study.',
      'All nurses on one acute ward.',
    );
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
    expect(screen.getByText('Claude Opus 5.5')).toBeTruthy();
    expect(api.posts).toEqual([
      {
        description:
          'Research questions\n1. Which nurses are central in the ward advice network?\n2. Do advice ties cross shift boundaries?\n\nResearch population\nAll nurses on one acute ward.\n\nStudy synopsis\nA sociocentric study.',
        provider: 'anthropic',
        jobId: expect.any(String),
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
        'Designed by Claude Opus 5.5 · worded by Claude Haiku 5.5 · 41 s · valid on the first try',
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit the study' }));
    expect(
      (
        await screen.findByRole<HTMLTextAreaElement>('textbox', {
          name: 'Research question 2',
        })
      ).value,
    ).toBe('Do advice ties cross shift boundaries?');
    expect(population().value).toBe('All nurses on one acute ward.');
    expect(synopsis().value).toBe('A sociocentric study.');
  });

  it('picks up the running job instead of starting another after going back', async () => {
    const api = mockApi(jobStatus({ status: 'running' }));
    render(<App />);
    await waitFor(() =>
      expect(generateButton()).toHaveProperty('disabled', false),
    );
    fireEvent.click(generateButton());
    await waitFor(() =>
      expect(
        api.fetchMock.mock.calls.some(
          ([input, init]) =>
            describeCall(input, init).url === '/api/jobs/job-1',
        ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const resume = await screen.findByRole('button', {
      name: /Back to your sketch/,
    });
    const polls = api.fetchMock.mock.calls.length;
    fireEvent.click(resume);
    expect(
      await screen.findByRole('heading', { name: 'Sketching your interview' }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(api.fetchMock.mock.calls.length).toBeGreaterThan(polls),
    );
    expect(api.posts).toHaveLength(1);

    // A changed study is a new run.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Research population' }),
      {
        target: { value: 'Someone else entirely' },
      },
    );
    expect(generateButton()).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Back to your sketch/ }),
    ).toBeNull();
  });

  it('shows the not-a-study notice on the describe screen when refused', async () => {
    mockApi(
      jobStatus({
        status: 'refused',
        refusalHint: 'Tell Sketch who you will interview.',
      }),
    );
    render(<App />);

    enterStudy(['Write me a poem about autumn leaves']);
    await waitFor(() =>
      expect(generateButton()).toHaveProperty('disabled', false),
    );
    fireEvent.click(generateButton());

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('These do not read as research questions yet'),
    ).toBeTruthy();
    expect(
      within(alert).getByText(/Tell Sketch who you will interview\./),
    ).toBeTruthy();
    expect(generateButton()).toHaveProperty('disabled', true);

    fireEvent.change(question(1), {
      target: { value: 'How do students form close friendships?' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(generateButton()).toHaveProperty('disabled', false);
  });

  it('adds and removes research questions, and needs one before generating', async () => {
    mockApi(succeededJob());
    render(<App />);
    await waitFor(() =>
      expect(generateButton()).toHaveProperty('disabled', false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(generateButton()).toHaveProperty('disabled', true);
    expect(document.activeElement).toBe(question(1));
    expect(
      screen.getByText('Add at least one research question.'),
    ).toBeTruthy();

    fireEvent.change(question(1), { target: { value: 'Too short' } });
    fireEvent.change(population(), {
      target: { value: 'Nurses on one ward' },
    });
    expect(generateButton()).toHaveProperty('disabled', true);
    fireEvent.change(question(1), {
      target: { value: 'How do nurses seek clinical advice?' },
    });
    expect(generateButton()).toHaveProperty('disabled', false);
    // The population is required.
    fireEvent.change(population(), { target: { value: '' } });
    expect(generateButton()).toHaveProperty('disabled', true);
    fireEvent.change(population(), {
      target: { value: 'Nurses on one ward' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Add a research question/ }),
    );
    expect(document.activeElement).toBe(question(2));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove research question 2' }),
    );
    expect(document.activeElement).toBe(question(1));
    expect(
      screen.queryByRole('textbox', { name: 'Research question 2' }),
    ).toBeNull();
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

  it('compares against the protocol already made instead of re-running it', async () => {
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const { url, method } = describeCall(input, init);
        if (url === '/api/config') return jsonResponse(configResponse(true));
        if (url === '/api/jobs' && method === 'POST') {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double reading its own request
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          posts.push(body);
          return jsonResponse({
            jobId: body.provider === 'openai' ? 'job-openai' : 'job-1',
          });
        }
        if (url === '/api/jobs/job-1') return jsonResponse(succeededJob());
        if (url === '/api/jobs/job-openai')
          return jsonResponse(
            jobStatus({ id: 'job-openai', provider: 'openai' }),
          );
        return jsonResponse({ error: 'unexpected' }, 500);
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(generateButton()).toHaveProperty('disabled', false),
    );
    fireEvent.click(generateButton());
    fireEvent.click(
      await screen.findByRole('button', { name: /See your protocol/ }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Compare with ChatGPT' }),
    );

    const claude = within(
      await screen.findByRole('article', { name: 'Claude' }),
    );
    expect(claude.getByText('Friendship and Wellbeing')).toBeTruthy();
    // ChatGPT is still designing, so there is nothing to prefer over yet.
    expect(
      claude.getByRole('button', { name: 'Prefer this one' }),
    ).toHaveProperty('disabled', true);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toMatchObject({
      provider: 'openai',
      seedJobId: 'job-1',
      comparisonId: expect.any(String),
    });
  });

  it('opens the stored-data answer from the privacy note', async () => {
    mockApi(succeededJob());
    render(<App />);
    const stored = screen.getByRole('button', { name: 'What is stored?' });
    expect(stored.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('link', { name: 'What we keep' }));
    await waitFor(() =>
      expect(stored.getAttribute('aria-expanded')).toBe('true'),
    );
  });

  it('explains a disabled Generate when no provider is set up', async () => {
    const none = configResponse(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          providers: none.providers.map((p) => ({ ...p, available: false })),
        }),
      ),
    );
    render(<App />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/no model provider is set up/)).toBeTruthy();
    expect(generateButton()).toHaveProperty('disabled', true);
  });
});
