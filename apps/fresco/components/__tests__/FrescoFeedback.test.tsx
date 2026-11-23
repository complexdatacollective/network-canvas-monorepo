import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({
  enabled: false,
  listeners: new Set<() => void>(),
  captureClientEvent: vi.fn(),
}));

vi.mock('~/lib/posthog-client', () => ({
  captureClientEvent: analytics.captureClientEvent,
  isAnalyticsEnabled: () => analytics.enabled,
  subscribeToAnalyticsEnabled: (listener: () => void) => {
    analytics.listeners.add(listener);
    return () => analytics.listeners.delete(listener);
  },
}));

vi.mock('~/fresco.config', () => ({
  POSTHOG_APP_PROPERTIES: { app: 'Fresco', $app_name: 'Fresco' },
}));

import FrescoFeedback from '../FrescoFeedback';

const ANSWER = '$survey_response_243dec7a-46fb-40aa-bd54-037e7d1c1c21';

const fetchMock = vi.fn<typeof fetch>(() =>
  Promise.resolve(new Response(null, { status: 200 })),
);

async function sendFeedback(text: string) {
  render(<FrescoFeedback />);
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  fireEvent.change(await screen.findByRole('textbox'), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('FrescoFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analytics.enabled = false;
    analytics.listeners.clear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends feedback through analytics while they are on', async () => {
    analytics.enabled = true;
    await sendFeedback('Let me duplicate a protocol.');

    expect(analytics.captureClientEvent).toHaveBeenCalledWith('survey shown', {
      $survey_id: '01a20a16-0382-0000-64b9-70293a6eed37',
    });
    expect(analytics.captureClientEvent).toHaveBeenLastCalledWith(
      'survey sent',
      expect.objectContaining({
        $survey_completed: true,
        [ANSWER]: 'Let me duplicate a protocol.',
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A deployment with analytics off still lets a researcher send what they
  // wrote. Nothing reaches the relay until they press Send.
  it('sends feedback anonymously on a deployment with analytics off', async () => {
    render(<FrescoFeedback />);
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Let me duplicate a protocol.' },
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ph-relay.networkcanvas.com/i/v0/e/');
    if (typeof init?.body !== 'string') throw new Error('Expected a JSON body');
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the body this test's own code path serialised
    const body = JSON.parse(init.body) as {
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).toBe('survey sent');
    expect(body.properties).toMatchObject({
      app: 'Fresco',
      $process_person_profile: false,
      $geoip_disable: true,
      [ANSWER]: 'Let me duplicate a protocol.',
    });
    expect(body.properties).not.toHaveProperty('installation_id');
    expect(analytics.captureClientEvent).not.toHaveBeenCalledWith(
      'survey sent',
      expect.anything(),
    );
  });

  it('strips a participant link out of feedback sent anonymously', async () => {
    await sendFeedback(
      'It broke at https://study.example.com/interview/clx0abc123def456ghi789jkl',
    );

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toEqual(expect.any(String));
    expect(init?.body).not.toContain('clx0abc123def456ghi789jkl');
  });
});
