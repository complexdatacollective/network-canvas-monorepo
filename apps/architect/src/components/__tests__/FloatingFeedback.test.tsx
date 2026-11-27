import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capture, sendFeedbackEvent } = vi.hoisted(() => ({
  capture: vi.fn(),
  sendFeedbackEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('~/analytics', () => ({
  posthog: { capture },
  sendFeedbackEvent,
}));

// The dialog has its own tests; these cover where its response goes. The
// stand-in reports opening on the trigger, as the dialog does, and sends a
// fixed response.
vi.mock('@codaco/fresco-ui/navigation/FeedbackDialog', () => ({
  default: function FeedbackDialog({
    onSubmit,
    onShown,
  }: {
    onSubmit: (response: { feedback: string; email?: string }) => unknown;
    onShown?: () => void;
  }) {
    return (
      <>
        <button type="button" onClick={() => onShown?.()}>
          Feedback
        </button>
        <button
          type="button"
          onClick={() =>
            void onSubmit({ feedback: 'Hello', email: 'me@example.com' })
          }
        >
          Send
        </button>
      </>
    );
  },
}));

import FloatingFeedback from '../FloatingFeedback';

const SURVEY_ID = '01a20a16-0382-0000-64b9-70293a6eed37';

describe('FloatingFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the form opening as usage, through posthog-js', () => {
    render(<FloatingFeedback />);
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));

    expect(capture).toHaveBeenCalledExactlyOnceWith('survey shown', {
      $survey_id: SURVEY_ID,
    });
    expect(sendFeedbackEvent).not.toHaveBeenCalled();
  });

  // posthog-js would attach the installation ID and its persistent identity
  // to the response, linking an email given in it to the installation's usage.
  it('sends a response through the anonymous sender, never posthog-js', async () => {
    render(<FloatingFeedback />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(sendFeedbackEvent).toHaveBeenCalledExactlyOnceWith(
        'survey sent',
        expect.objectContaining({
          $survey_id: SURVEY_ID,
          $survey_response_1: 'me@example.com',
        }),
      ),
    );
    expect(capture).not.toHaveBeenCalled();
  });
});
