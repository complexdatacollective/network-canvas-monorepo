---
'@codaco/interview': patch
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Numbers, lists, coordinates and alphabetical order inside an interview now
follow the language the participant is reading the protocol in, even when the
interface itself is in another language. A participant reading a protocol in
German sees `1.234,5`, a list as "a, b und c", and names sorted by German
rules, rather than English formats and the browser's default order. Form
fields in the interview follow it too: a date picker names its months, and a
scale writes its value, in the protocol's language. Sentences the interface
speaks, such as validation messages, stay in the interface language.

On a roster card, an empty value or empty list now reads "No value" in the
interface language (translated for every interface language) instead of a bare
dash, and numbers, lists and locations are formatted for the protocol language.

`@codaco/fresco-ui`: `Collection` takes a `sortLocale` prop (and
`createCollectionSorter` a `locale` argument) to choose the language text is
ordered in. Without it, `Collection` orders text in the interface language
instead of the browser's default. `ContentLocaleProvider`
(`@codaco/fresco-ui/form/ContentLocale`) names the language form fields write
their values in; without one they use the interface language.
