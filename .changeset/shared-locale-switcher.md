---
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
---

Architect and Interviewer share one interface-language switcher. In Architect
it sits in the header navigation and names the language in use, written in
that language; in Interviewer it is a globe button in the home status bar.
Both open a list of every interface language, each written in itself. The
first entry, Automatic, says which language the browser currently resolves to,
and while it is chosen the switcher names that language rather than announcing
itself as automatic.

Choosing an entry applies at once and closes the list. A choice that could not
be stored is reported in the list's footer, with a button to try again.

Architect's language dialog behind the translate icon is retired in favour of
the header switcher. Interviewer's settings dialog, welcome screen and setup
wizard keep their language selects.

For anyone building on `@codaco/fresco-ui`: `navigation/LocaleSwitcher` is the
new component. It takes the app's locale registry, the stored preference, the
locale automatic resolves to, the host's save state, and whether it persists
to a device or an account; its own chrome is translated once under
`frescoUi.localeSwitcher.*`. `display` chooses what the trigger shows beside
the globe — `label` always names the language, `icon` never does, and
`responsive` drops the name once its container is narrower than 36em.
`searchable` adds a search box, for a host offering more languages than a list
can carry comfortably; it is off by default and matches a language by its own
name or its tag. A host whose bar dresses its own controls hands the trigger
element in as `renderTrigger`; Architect's header does, so the switcher sits
in its navigation list styled like the links beside it.
