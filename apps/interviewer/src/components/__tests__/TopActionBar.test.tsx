import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({ enabled: false, track: vi.fn() }));

vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => analytics,
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({ mode: 'none', lock: vi.fn() }),
}));

vi.mock('~/components/ViewSwitcher', () => ({ ViewSwitcher: () => null }));

vi.mock('~/i18n/InterviewerLocaleSwitcher', () => ({ default: () => null }));

import { TopActionBar } from '../TopActionBar';

const SURVEY_ID = '01a20a16-0382-0000-64b9-70293a6eed37';
const ANSWER = '$survey_response_243dec7a-46fb-40aa-bd54-037e7d1c1c21';

type CaptureBody = {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
};

const fetchMock = vi.fn<typeof fetch>(() =>
  Promise.resolve(new Response(null, { status: 200 })),
);

async function sendFeedback(text: string): Promise<CaptureBody> {
  render(<TopActionBar onOpenSettings={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  await userEvent.type(await screen.findByRole('textbox'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://ph-relay.networkcanvas.com/i/v0/e/');
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON body');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the body this test's own code path serialised
  return JSON.parse(init.body) as CaptureBody;
}

describe('TopActionBar feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analytics.enabled = false;
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Writing feedback is the user's own choice to send something, so it does
  // not depend on the analytics preference.
  it('sends feedback anonymously while analytics are off', async () => {
    const body = await sendFeedback('Show the case ID on the resume pill.');

    expect(body.event).toBe('survey sent');
    expect(body.properties).toMatchObject({
      $survey_id: SURVEY_ID,
      $survey_completed: true,
      [ANSWER]: 'Show the case ID on the resume pill.',
      app: 'interviewer',
      $process_person_profile: false,
    });
    expect(body.properties).not.toHaveProperty('installation_id');
  });

  it('sends feedback through analytics while they are on', async () => {
    analytics.enabled = true;
    render(<TopActionBar onOpenSettings={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    await userEvent.type(await screen.findByRole('textbox'), 'More themes.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(analytics.track).toHaveBeenLastCalledWith(
      'survey sent',
      expect.objectContaining({ [ANSWER]: 'More themes.' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // `track` is the provider's own gate: it sends nothing while analytics are
  // off, so opening the form stays a usage event.
  it('reports the form opening through analytics, not the direct send', async () => {
    render(<TopActionBar onOpenSettings={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Feedback' }));

    expect(analytics.track).toHaveBeenCalledExactlyOnceWith('survey shown', {
      $survey_id: SURVEY_ID,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
