---
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
---

Architect and Interviewer share one interface-language switcher. A pill in
Architect's header and in Interviewer's home status bar names the language in
use ("Auto · EN" while following the browser, or the language's code) and opens
a list of every interface language, each written in itself with its code
beside it. The first entry, Automatic, says which language the
browser currently resolves to. Choosing an entry applies at once and keeps
the list open while the footer reports the outcome: a spinner while saving,
then "Saved on this device." for a moment, or a note that the choice could
not be saved with a button to try again.

Architect's language dialog behind the translate icon is retired in favour of
the pill. Interviewer's settings dialog, welcome screen and setup wizard keep
their language selects.

For anyone building on `@codaco/fresco-ui`: `navigation/LocaleSwitcher` is the
new component. It takes the app's locale registry, the stored preference, the
locale automatic resolves to, the host's save state and whether it persists
to a device or an account, and a host-supplied footer note; its own chrome is translated once under `frescoUi.localeSwitcher.*`. A search
box appears once the list is longer than six entries.
