---
'@codaco/fresco-ui': minor
'@codaco/shared-consts': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Architect, Interviewer and Fresco have a Feedback button. In Architect it floats in the bottom corner of the window; in Interviewer and Fresco it is in the top bar. It opens a dialog where you choose who should see your feedback. **Community forum**, the default, makes it a public post on the community forum: you choose the forum section (Feedback & Feature Requests, Help & Support or General Conversation) and a title, and the forum opens in a new tab with your post filled in for you to post under your own account. **Our team** sends it privately to the Network Canvas team instead, with your email if you would like a reply; without an email it is anonymous and, in Interviewer and Fresco, does not carry the installation ID and goes out whether or not analytics are turned on. You can write with lists and bold or italic text. If it cannot be sent, the form keeps what you wrote so you can try again. In `@codaco/fresco-ui`, the new `navigation/FeedbackDialog` component draws the button and the dialog; in `@codaco/shared-consts`, `appFeedbackSurvey` sends a private response as a PostHog survey response and `sendAnonymousPostHogEvent` delivers it without posthog-js.
