---
"@codaco/interview": minor
"@codaco/interviewer": minor
---

Participants can now adjust the interview's text size.

The Shell accepts a new `allowUserScaling` prop. When a host enables it (as
Interviewer now does), the interview Navigation shows a settings menu with a
"Text size" control offering 90%–130% of the default size. The chosen size
scales the whole interview — text, spacing, and touch targets together — takes
effect immediately with the menu open for live preview, and lasts for the
current session. The control is fully keyboard operable and announces its
state to screen readers.

The standalone exit button has moved into the same settings menu as an
"Exit interview" action. Hosts that provide neither an exit handler nor
`allowUserScaling` render no settings menu.
