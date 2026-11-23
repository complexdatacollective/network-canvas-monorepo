/**
 * The Feedback control in Architect, Interviewer and Fresco answers a PostHog
 * survey of type API, "App feedback". The ids are the survey's and its one
 * question's in PostHog, so a change to either there must change here too.
 * Which app a response came from is the `app` super property every product
 * already registers.
 */
const APP_FEEDBACK_SURVEY = {
  id: '01a20a16-0382-0000-64b9-70293a6eed37',
  question: '243dec7a-46fb-40aa-bd54-037e7d1c1c21',
} as const;

const APP_FEEDBACK_MAX_LENGTH = 2000;

type Capture = (event: string, properties: Record<string, unknown>) => unknown;

/**
 * What the Feedback control needs to answer the survey, bound to an app's own
 * way of capturing an event. Each send is its own response.
 *
 * Opening the form is usage, so it goes through `capture`, which an app with
 * analytics off already silences. What someone writes and sends is theirs to
 * send either way: such an app passes `captureResponse` to deliver it. A
 * `captureResponse` that returns a promise is awaited by the control, which
 * keeps the text for another try if it rejects.
 */
export function appFeedbackSurvey(
  capture: Capture,
  captureResponse: Capture = capture,
) {
  return {
    maxLength: APP_FEEDBACK_MAX_LENGTH,
    onShown: () => {
      void capture('survey shown', { $survey_id: APP_FEEDBACK_SURVEY.id });
    },
    onSubmit: async (feedback: string) => {
      await captureResponse('survey sent', {
        $survey_id: APP_FEEDBACK_SURVEY.id,
        $survey_submission_id: crypto.randomUUID(),
        $survey_completed: true,
        [`$survey_response_${APP_FEEDBACK_SURVEY.question}`]: feedback,
      });
    },
  };
}
