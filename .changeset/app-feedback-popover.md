---
'@codaco/fresco-ui': minor
'@codaco/shared-consts': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Architect, Interviewer and Fresco have a Feedback button in the top bar. It opens one question, "How could we improve this app?", over a text box, and what you write is sent to the Network Canvas team. Feedback you send goes out even when analytics are turned off in Interviewer or disabled for a Fresco deployment; in that case it is anonymous and does not carry the installation ID. In `@codaco/fresco-ui`, the new `navigation/FeedbackPopover` component draws the button and the form; in `@codaco/shared-consts`, `appFeedbackSurvey` sends the answer as a PostHog survey response and `sendAnonymousPostHogEvent` delivers it where analytics are off.
