---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/interview': patch
'@codaco/architect': patch
---

Variables an interview interface owns can no longer be quietly overwritten from
somewhere else in the protocol.

A Family Pedigree works out several of its variables from the family tree the
participant draws — which person is the participant, how each relative is
related to them, and what kind each relationship is. Those variables belonged to
the pedigree, but nothing stopped another part of the protocol writing to them.
A nomination prompt could be pointed at the pedigree's own participant marker,
after which several relatives came back marked as the participant and the
pedigree's completeness checks passed over an unfinished family tree without
comment. A disease could be mapped to the same variable, painting the
participant as affected in every preview.

Alongside that, three related gaps are closed:

- A form can no longer ask for the same variable twice. Both fields shared a
  single answer, and whichever was registered last silently replaced the other's
  input control and validation rules.
- A Categorical, Ordinal or Tie Strength bin can still be built on a pedigree's
  biological-sex variable — sorting family members by sex is a legitimate thing
  to want — but it can no longer rewrite that variable's fixed set of options.
  Saving such a bin used to change them, which invalidated the whole protocol
  and left the researcher on a recovery screen whose only exit discarded the
  stage they had just created. The options are now shown read-only, with the
  reason.
- A Narrative Pedigree can no longer record two diseases against one variable,
  or two diseases under the same name. Both were accepted silently, and left the
  pedigree with two contradictory answers for one set of affected relatives.

Where a protocol already contains one of these problems, Architect now says so
when the protocol is opened, lists each problem in plain language, and offers to
fix them — describing exactly what each fix will change and writing nothing
until the researcher accepts. A protocol whose problems cannot be fixed
automatically is described rather than opened, so it is never left half-repaired.

Finally, a family pedigree that cannot find the participant in its own tree — or
finds several — now says so instead of reporting the tree as complete.
