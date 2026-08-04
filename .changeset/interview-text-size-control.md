---
"@codaco/interview": minor
"@codaco/interviewer": minor
"@codaco/tailwind-config": patch
---

Participants can now adjust the interview's text size.

The Shell accepts a new `allowUserScaling` prop. When a host enables it (as
Interviewer now does), the interview Navigation shows a settings menu with a
"Text size" control offering 90%–130% of the default size. The chosen size
scales the whole interview — text, spacing, and touch targets together, with
every step of the fluid type scale changing by exactly the chosen percentage —
takes effect immediately with the menu open for live preview, and lasts for
the current session. The control is fully keyboard operable and announces its
state to screen readers. Hosts can persist the choice across remounts with the
optional `initialTextScale`/`onTextScaleChange` props; Interviewer uses them so
an idle-lock/unlock cycle no longer resets a participant's chosen size.

The standalone exit button has moved into the same settings menu as an
"Exit interview" action. Hosts that provide neither an exit handler nor
`allowUserScaling` render no settings menu.
