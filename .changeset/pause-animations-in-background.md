---
'@codaco/fresco-ui': minor
'@codaco/art': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Architect and Interviewer use much less battery when left open in the background. The animations on their start screens — the timeline on Architect's, and on Interviewer's the drifting lights in the background and the pulsing dot on the resume button — now pause whenever the app's window is not the one you are using, and carry on from where they stopped when you come back. Before, they kept running at full speed in any window still on screen, which is why macOS reported the installed apps as using significant energy. In `@codaco/fresco-ui`, the new `usePageActive` hook (`@codaco/fresco-ui/pageActivity`) says whether the page is in front of the user, and in `@codaco/art`, `BackgroundLights` takes a `paused` prop.
