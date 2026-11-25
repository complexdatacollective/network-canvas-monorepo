---
'@codaco/interview': minor
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Participants can now change the interview language at any point in an interview. When a protocol has more than one language, the interview navigation shows a language button that lists the protocol's languages, each written in its own language, and choosing one changes the interview language immediately, as the Language Chooser does. Participants no longer need to go back to the Language Chooser to change the language. The button is not shown while a Language Chooser is on screen, or when the protocol has only one language.

The interview navigation no longer has a settings menu. Exiting the interview and changing the text size each have their own button in the navigation, so participants can find them without opening a menu. The text size button offers five sizes to choose from, from 90% to 130%. The Back and Next buttons are now next to each other at the end of the navigation, in the side bar as well as in the bottom bar. In Interviewer, the text size button can be turned off with the new "Allow text size changes" setting in the Interview section of Settings. It is on by default. Fresco no longer shows the text size button, because participants use their own devices and can change the text size in their browser.

In `@codaco/fresco-ui`, `LocaleSwitcher` no longer requires `automaticLocale`: without it, the list contains no automatic entry. A new `label` prop sets the name that screen readers read for the switcher, a new `icon` prop replaces the globe on its button, and `side` also accepts `left` and `right`, for a switcher in a side rail. `SegmentedSwitcher` has a new `plain` variant that draws no track, for a switcher whose container is its track, such as a pill-shaped popup. The popover arrow's class name and padding are exported from `@codaco/fresco-ui/popoverArrow`, for popups built directly on Base UI.
