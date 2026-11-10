---
'@codaco/interview': major
'@codaco/protocol-validation': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

An interview is now shown in one language from start to finish. Every word a
participant or interviewer reads comes from the protocol, including the
interview's own buttons, menus and messages, so a browser set to French and
Spanish no longer gets a Spanish protocol inside French buttons.

- The interview chooses its language once, from the protocol's languages: the
  language a Language Chooser stage or the host states, or else the
  protocol language that best fits the participant's browser languages, or
  else the protocol's default language.
- Text that only screen readers read, such as announcements and the names of
  icon buttons, stays in English. It is not interface text, so a protocol
  never holds it and it is never offered for translation.
- Icons beside text that already says what they mean are hidden from screen
  readers.

**Protocols (`@codaco/protocol-validation`)**

- Interface text gains an `interviewer` group for the words only an interviewer
  sees (leaving the review of a finished interview, showing a screen that
  earlier answers hid), and the interview's remaining built-in words: copying
  debug information, loading, unnamed nodes, and a failed exit.
- Words that every stage of one type shows alike are held once in interface
  text, in a group named for that stage type: `familyPedigree`,
  `categoricalBin`, `quickAdd` (the quick-add name box's placeholder),
  `networkComposer`, plus `familyTreeView` for the controls both pedigree
  stages share. Each group is held only while the protocol has a stage that
  shows it, and an entry that only some configurations show (such as a
  Categorical Bin's Place here button, shown only when it places nodes by
  tapping) only while one does.
- A protocol must hold all the interface text it shows. Validation refuses one
  that lacks a group, or an entry of a group, that something in it shows,
  naming each at its place in `interfaceText`. Architect, Studio and the
  schema 8 migration write this text, so only a protocol written by hand can
  lack it. An entry may still be held without text where Network Canvas has
  no wording in the protocol's default language, until the researcher writes
  it.
- Buttons that any stage might show are worded once, among `buttons`: `undo`,
  `redo`, `skip`, `zoomIn` and `zoomOut` join `copy`.
- `STAGE_TYPE_INTERFACE_TEXT` names the groups each stage type shows, and
  `suppliedInterfaceText(group, key, localization)` gives Network Canvas's
  wording of one entry in a protocol's languages.

**Architect**

- Every stage editor's wording section is called "Customize built-in wording"
  ("Customise" in British English), with the same description on every stage.
  It appears only on a stage that has interface wording to edit: a name
  generator with no nomination limits has none.
- The section can be switched off, which puts back Network Canvas's wording in
  every language, asking first if you changed any of it. It starts switched on
  when the protocol has more than one language, so missing translations are in
  view, or when the stage already holds wording of your own.
- A stage whose type shares wording with every stage of that type lets you
  edit that wording in the section itself. When the stage also has wording of
  its own, the section opens and closes two parts, "Specific to this stage"
  and "Shared by every stage of this kind". Shared wording is saved as you
  leave each field, because it changes every stage of that type, and switching
  the section off resets it too. The Categorical Bin editor gains the section
  for its shared wording.
- Every field in the section has a hint saying where the participant sees that
  text and what it is for, including when it is shown only as a tooltip.
- The Family Pedigree editor lists all of its wording under "Specific to this
  stage", without the headings that used to split it into groups.
- The translation table lists the new Interviewer controls group and a group
  for each stage type's shared wording.

**Breaking for hosts of `@codaco/interview`.** The `./locales` and `./catalog`
entry points are gone, and the interview no longer loads a message catalog of
its own: everything it shows comes from the protocol. A host component rendered
inside the Shell that should match the interview's language reads it with
`useContentLocale()`, or with `useContentLocaleIn(locales, fallback)` to get
the nearest of the languages the host translates its own text into (es for a
protocol in es-MX).
