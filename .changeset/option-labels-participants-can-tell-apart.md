---
'@codaco/protocol-validation': minor
'@codaco/shared-consts': major
'@codaco/architect': minor
---

Two options of one attribute, or two diseases of a Narrative Pedigree stage,
can no longer have labels that read the same in any language a participant can
see, including where one label has no translation and falls back to another
language's text. This covers categorical, ordinal and yes-or-no attributes, so
the two answers of a yes-or-no attribute must differ by more than capital
letters or spaces. A protocol being edited may hold such a pair for a while,
but validation of a finished protocol refuses it, and so does upgrading an
older protocol to schema 9: the upgrade stops with an error naming the
attribute and both labels. Network Canvas does not change the labels for you.

A stage name may now be at most 50 characters in every language, counted as a
reader sees them. Upgrading an older protocol with a longer stage name to
schema 9 stops with an error naming the stage; shorten the name in the version
of Architect that made the protocol, then open it again.

In Architect:

- Changing the protocol's default language, or its languages, can leave two
  labels that read the same where one falls back to another language. The
  change is made, and the Stages page lists each such pair with its attribute
  or stage, both labels and the language, and a link to where it is fixed.
  The protocol can't be downloaded or sent to Interviewer until every pair
  differs.
- Opening an older protocol that one of these rules refuses explains which
  attribute or stage is at fault and how to fix it.
- The translation table applies the same rules to each translation as the
  editor that owns the text. A repeated disease name or option label, a stage
  name longer than 50 characters, and interview text with no words in the
  default language are each shown in the cell. Saving checks the whole
  protocol first: if the translations would leave it broken, nothing is saved,
  and Architect shows the cell at fault, even when a search or a hidden
  language column was hiding it. A pair of labels that already read the same
  before you started does not stop you saving; it stays listed on the Stages
  page.
- An option label that differs from another only by spaces at either end is
  now reported as a repeat.

`@codaco/shared-consts` no longer exports `isUnwrittenLabel` or
`hasDuplicateOptionLabels`. Use `findDuplicateOptionLabels` from
`@codaco/protocol-validation` instead.
