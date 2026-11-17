---
'@codaco/interview': minor
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Network Canvas now supplies its own interview wording in Arabic. A schema 9
protocol with Arabic as one of its languages shows Network Canvas's Arabic for
every built-in text it does not reword: buttons, validation messages, the
Family Pedigree's tools, questions and relationship words, the finish screen,
and the answers for sex assigned at birth and the kinds of relationship.
Architect writes the Arabic finish screen text and proposes stage names in
Arabic, like the other supplied languages.

In a right-to-left interview, a name drawn inside a person's symbol keeps its
punctuation in place ("team-b!" no longer shows as "!team-b"), and the Family
Pedigree's add buttons wrap a two-word relationship onto two lines inside the
circle instead of running out of it.

For developers: `SUPPLIED_LANGUAGES` includes `ar`, with
`packages/interview/src/locales/wording/ar.json` and Arabic entries in the
option-label, finish-text and stage-name tables. The Arabic was checked by
blind back-translation and adversarial comparison, and waits for review by a
native speaker.
