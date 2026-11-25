---
'@codaco/interview': minor
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Participants can now change the interview language at any point in an interview. When a protocol has more than one language, the interview navigation shows a globe button that lists the protocol's languages, each written in its own language, and choosing one changes the interview language immediately, as the Language Chooser does. Participants no longer need to go back to the Language Chooser to change the language. The button is not shown while a Language Chooser is on screen, or when the protocol has only one language. In `@codaco/fresco-ui`, `LocaleSwitcher` no longer requires `automaticLocale`: without it, the list contains no automatic entry. A new `label` prop sets the name that screen readers read for the switcher, and `side` also accepts `left` and `right`, for a switcher in a side rail.
