---
'@codaco/fresco-ui': minor
'@codaco/shared-consts': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Architect, Interviewer and Fresco have a Feedback button. In Architect it floats in the bottom corner of the window; in Interviewer and Fresco it is in the top bar. It opens a dialog where you choose who should see your feedback. **Community forum**, the default, makes it a public post in the Feedback & Feature Requests section of the community forum: you give it a title, and the forum opens in a new tab with your post filled in for you to post under your own account. A post that is too long for the forum to receive shows an error instead, so that you can shorten it or send it to the team. **Our team** sends it privately to the Network Canvas team instead, with your email if you would like a reply; without an email it is anonymous. It never carries the installation ID, and in Interviewer and Fresco it is sent whether or not analytics are turned on. Every Feedback button in an app opens the same draft, so closing the dialog, or the menu that contains the button, does not lose what you wrote. You can write with lists and bold or italic text. If it cannot be sent, the form keeps what you wrote so you can try again. In `@codaco/fresco-ui`, the new `navigation/FeedbackDialog` component draws the button and the dialog; in `@codaco/shared-consts`, `appFeedbackSurvey` sends a private response as a PostHog survey response and `sendAnonymousPostHogEvent` delivers it without posthog-js.
