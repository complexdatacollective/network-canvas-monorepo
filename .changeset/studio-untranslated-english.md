---
'@codaco/studio-web': patch
'@codaco/studio-api': patch
'@codaco/studio-contract': minor
---

Text that stayed in English whatever the interface language is now translated.
The team activity log names each kind of action in the reader's language, in
its rows, its detail dialog and its action filter; the server no longer sends
an English title with each event or filter option. The protocol editor's
outline names each screen's kind by its interface name ("Name Generator (quick
add)") rather than its type id ("NameGeneratorQuickAdd"). The Validation card
describes each problem in Studio's own words, saying when something required is
missing, instead of showing the schema library's message ("Invalid input:
expected string, received undefined"); the protocol's own rules keep their
wording.
