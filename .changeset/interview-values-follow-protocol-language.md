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
rules, rather than English formats and the browser's default order. When the
protocol does not specify a language, the interface language is used.

On a roster card, an empty value or empty list now reads "No value" in the
interface language (translated for every interface language) instead of a bare
dash, and numbers, lists and locations are formatted for the protocol language.

`@codaco/fresco-ui`: `Collection` takes a `sortLocale` prop (and
`createCollectionSorter` a `locale` argument) to choose the language text is
ordered in. Without it, `Collection` orders text in the interface language
instead of the browser's default.
