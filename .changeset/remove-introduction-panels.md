---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/development-protocol': patch
'@codaco/sample-protocol': patch
---

Per Alter Form, Per Alter Edge Form, Dyad Census and Tie-Strength Census
stages no longer have an introduction panel. Instructions for participants
before these stages now live in Information stages, so they are written,
translated and skipped in one place. An Ego Form keeps its introduction, a
title and optional text shown above its questions.

Per Alter Form, Per Alter Edge Form, Dyad Census and Tie-Strength Census
stages now open straight on their first question or pair, and Back from
there leaves the stage. When one of these stages has no one to ask about (no
person or relationship of its type, or fewer than two people for a census),
the interview passes over it going forwards and backwards, and the stages
menu shows it as hidden by the answers given so far. Architect no longer offers an introduction section
for these stages.

Upgrading a protocol from schema 8 turns each introduction panel into an
Information stage just before its stage, with the panel's title and text.
The new stage copies the original stage's skip logic, and skip logic that
jumped to the original stage now jumps to the new one. An Ego Form keeps its
panel. The migration notes describe this in every supported language.

For developers: only the schema 9 Ego Form has an `introductionPanel`, and
`SyntheticInterview` takes introduction panel options for Ego Forms only.
