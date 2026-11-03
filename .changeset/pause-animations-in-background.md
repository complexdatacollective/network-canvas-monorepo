---
'@codaco/fresco-ui': minor
'@codaco/art': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Architect and Interviewer use much less battery when left open in the background. Animations that never end on their own — the timeline on Architect's start screen, the drifting lights behind Interviewer, loading spinners, and the bobbing and pulsing that draw attention during an interview — now pause whenever the app's window is not the one you are using, and carry on when you come back to it. Before, they kept running at full speed in any window still on screen, which is why macOS reported the installed apps as using significant energy. Fresco's moving background behind its sign-in and setup pages now pauses the same way, and carries on from where it stopped. On a sociogram, the lines between people and the shaded groups are also now redrawn only when someone moves, instead of on every frame. In `@codaco/fresco-ui`, the new `pageActivity` module (`usePageActive`, `isPageActive` and `subscribeToPageActivity`) says whether the page is in front of the user, and `AnimationProvider` uses it to pause endless CSS and Web Animations API animations while it is not.
