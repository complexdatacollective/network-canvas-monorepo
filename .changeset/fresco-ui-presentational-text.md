---
'@codaco/fresco-ui': major
---

Form fields can show text written in a language other than the page's.

A new `@codaco/fresco-ui/PresentationalText` module exports the
`PresentationalText` type: a plain string, or `{ text, lang, dir }` for text in
another language. Field labels and hints, and option labels in `Boolean`,
`CheckboxGroup`, `Combobox`, `LikertScale`, `RadioGroup`, `RadioMatrixField`,
`RichSelectGroup`, `Select`, `ToggleButtonGroup` and `VisualAnalogScale`,
accept it. The element that shows the text gets its `lang` and `dir`, so
browsers and screen readers pronounce, hyphenate and lay it out correctly,
while filtering, keys and `aria-label` use the bare text. In
`RichSelectGroup`, a label or description written in the other direction stays
beside its indicator. `isPresentationalText`, `presentationalTextValue` and
`presentationalTextProps` help components handle both forms. The Language
Chooser stage type has a colour and icon.

`Combobox`, `Select` and `IconPicker` fields no longer grow wider than the
space they are given when the text they show is long. The text is cut off with
an ellipsis instead of running past the edge of its dialog.

A button whose label is too long for it now cuts the label off with an
ellipsis at its end, instead of clipping both the start and the end of the
label.

`ProgressBar` takes a `tone` of `neutral` (the default, unchanged) or `info`.
An `info` bar fills its unfinished progress with the info colour, so a bar
under way reads apart from both an empty track and a complete bar.

**Breaking:** `SelectOption.lang` is removed. Pass a label in another language
as `{ text, lang, dir }` instead, as `LocaleSelect` now does.
