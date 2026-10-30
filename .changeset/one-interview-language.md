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
  language a Language Chooser stage or the host states, or else the first of
  the participant's browser languages that the protocol offers, or else the
  protocol's default language.
- Text that only screen readers read, such as announcements and the names of
  icon buttons, stays in English for now.
- Icons beside text that already says what they mean are hidden from screen
  readers.

**Protocols (`@codaco/protocol-validation`)**

- Interface text gains an `interviewer` group for the words only an interviewer
  sees (leaving the review of a finished interview, showing a screen that
  earlier answers hid), and the interview's remaining built-in words: copying
  debug information, loading, unnamed nodes, and a failed exit.
- Words that every stage of one type shows alike are held once in interface
  text, in a group named for that stage type: `familyPedigree`,
  `categoricalBin`, `roster`, `networkComposer` and `egoForm`, plus
  `familyTreeView` for the controls both pedigree stages share. Each group is
  held only while the protocol has a stage that shows it.
- Buttons that any stage might show are worded once, among `buttons`: `undo`,
  `redo`, `skip`, `zoomIn` and `zoomOut` join `copy`.
- `STAGE_TYPE_INTERFACE_TEXT` names the groups each stage type shows.

**Architect**

- A stage editor's wording section can be switched off, which puts back Network
  Canvas's wording in every language, asking first if you changed any of it.
  It starts switched on when the protocol has more than one language, so
  missing translations are in view, or when the stage already holds wording of
  your own.
- A stage whose type shares wording with every stage of that type lists that
  wording in its wording section, under "Shared by every stage of this kind",
  and you change or translate it in the translation table. The Ego Form and
  Categorical Bin editors gain a Participant wording section for it.
- The translation table lists the new Interviewer controls group and a group
  for each stage type's shared wording.

**Breaking for hosts of `@codaco/interview`.** The `./locales` and `./catalog`
entry points are gone, and the interview no longer loads a message catalog of
its own: everything it shows comes from the protocol. A host component rendered
inside the Shell that should match the interview's language reads it with
`useContentLocale()`.
