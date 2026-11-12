---
'@codaco/app-i18n': minor
'@codaco/fresco-ui': minor
'@codaco/network-exporters': minor
'@codaco/protocol-utilities': minor
'@codaco/protocol-validation': minor
---

Add Arabic (`ar`), the first right-to-left language, to the shared language
list and translate every shared catalog into it: the common controls, the
components, the export and protocol messages, and the protocol upgrade notes.
An app that lists `ar` among its languages now gets these in Arabic, laid out
right to left. No app lists it yet.

The Arabic is Modern Standard Arabic, checked by reverse translation and not
yet reviewed by a native speaker. Its terminology is recorded in
`packages/app-i18n/glossary/ar.md`.
