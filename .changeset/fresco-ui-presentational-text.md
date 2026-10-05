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
while filtering, keys and `aria-label` use the bare text.
`isPresentationalText`, `presentationalTextValue` and
`presentationalTextProps` help components handle both forms. The Language
Chooser stage type has a colour and icon.

**Breaking:** `SelectOption.lang` is removed. Pass a label in another language
as `{ text, lang, dir }` instead, as `LocaleSelect` now does.
