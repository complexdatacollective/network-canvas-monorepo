import { describe, expect, it, vi } from 'vitest';

import { appFeedbackSurvey } from '../app-feedback.ts';

const SURVEY_ID = '01a20a16-0382-0000-64b9-70293a6eed37';
const QUESTION_ID = '243dec7a-46fb-40aa-bd54-037e7d1c1c21';

describe('appFeedbackSurvey', () => {
  it('reports that the survey was shown', () => {
    const capture = vi.fn();
    appFeedbackSurvey(capture).onShown();

    expect(capture).toHaveBeenCalledExactlyOnceWith('survey shown', {
      $survey_id: SURVEY_ID,
    });
  });

  it('sends the feedback as a complete response to the one question', async () => {
    const capture = vi.fn();
    await appFeedbackSurvey(capture).onSubmit({
      feedback: 'Add a dark theme.',
    });

    expect(capture).toHaveBeenCalledExactlyOnceWith('survey sent', {
      $survey_id: SURVEY_ID,
      $survey_submission_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      $survey_completed: true,
      [`$survey_response_${QUESTION_ID}`]: 'Add a dark theme.',
    });
  });

  it('sends an email left for a reply as the second answer', async () => {
    const capture = vi.fn();
    await appFeedbackSurvey(capture).onSubmit({
      feedback: 'Add a dark theme.',
      email: 'researcher@example.org',
    });

    expect(capture).toHaveBeenCalledExactlyOnceWith(
      'survey sent',
      expect.objectContaining({
        [`$survey_response_${QUESTION_ID}`]: 'Add a dark theme.',
        $survey_response_1: 'researcher@example.org',
      }),
    );
  });

  it('sends each feedback as its own response', async () => {
    const capture =
      vi.fn<(event: string, properties: Record<string, unknown>) => void>();
    const { onSubmit } = appFeedbackSurvey(capture);
    await onSubmit({ feedback: 'First.' });
    await onSubmit({ feedback: 'Second.' });

    const [first, second] = capture.mock.calls.map(
      ([, properties]) => properties.$survey_submission_id,
    );
    expect(first).not.toBe(second);
  });

  it('reports the form opening and the response through separate captures', async () => {
    const capture = vi.fn();
    const captureResponse = vi.fn();
    const survey = appFeedbackSurvey(capture, captureResponse);
    survey.onShown();
    await survey.onSubmit({ feedback: 'Add a dark theme.' });

    expect(capture).toHaveBeenCalledExactlyOnceWith(
      'survey shown',
      expect.anything(),
    );
    expect(captureResponse).toHaveBeenCalledExactlyOnceWith(
      'survey sent',
      expect.anything(),
    );
  });
});
