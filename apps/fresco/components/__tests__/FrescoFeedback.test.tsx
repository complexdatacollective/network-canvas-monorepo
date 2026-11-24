import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureClientEvent = vi.hoisted(() => vi.fn());

vi.mock('~/lib/posthog-client', () => ({ captureClientEvent }));

vi.mock('~/fresco.config', () => ({
  POSTHOG_APP_PROPERTIES: { app: 'Fresco', $app_name: 'Fresco' },
}));

// The dialog has its own tests; these cover where its response goes. The
// stand-in opens on the trigger, as the dialog does, and sends what is typed.
vi.mock('@codaco/fresco-ui/navigation/FeedbackDialog', async () => {
  const { useState } = await import('react');
  return {
    default: function FeedbackDialog({
      onSubmit,
      onShown,
    }: {
      onSubmit: (response: { feedback: string }) => unknown;
      onShown?: () => void;
    }) {
      const [text, setText] = useState('');
      return (
        <>
          <button type="button" onClick={() => onShown?.()}>
            Feedback
          </button>
          <textarea
            aria-label="Your feedback"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="button"
            onClick={() => void onSubmit({ feedback: text })}
          >
            Send
          </button>
        </>
      );
    },
  };
});

import FrescoFeedback from '../FrescoFeedback';

const ANSWER = '$survey_response_243dec7a-46fb-40aa-bd54-037e7d1c1c21';

const fetchMock = vi.fn<typeof fetch>(() =>
  Promise.resolve(new Response(null, { status: 200 })),
);

async function sendFeedback(text: string) {
  render(<FrescoFeedback />);
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your feedback' }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
}

describe('FrescoFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // `captureClientEvent` is what a deployment with analytics off silences, so
  // opening the form is reported only through it and never directly.
  it('reports the form opening through analytics only', async () => {
    render(<FrescoFeedback />);
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));

    expect(captureClientEvent).toHaveBeenCalledExactlyOnceWith('survey shown', {
      $survey_id: '01a20a16-0382-0000-64b9-70293a6eed37',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Whatever the deployment's analytics setting, what a researcher writes and
  // sends goes straight to the relay, anonymously.
  it('sends feedback anonymously, without going through analytics', async () => {
    await sendFeedback('Let me duplicate a protocol.');

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
    expect(captureClientEvent).not.toHaveBeenCalledWith(
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
