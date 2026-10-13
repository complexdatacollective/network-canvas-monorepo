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

Stages no longer have an introduction panel. Instructions for participants
now live in Information stages, so they are written, translated and skipped
in one place.

Per Alter Form, Per Alter Edge Form, Dyad Census and Tie-Strength Census
stages now open straight on their first question or pair, and Back from
there leaves the stage. When one of these stages has no one to ask about (no
person or relationship of its type, or fewer than two people for a census),
the interview passes over it going forwards and backwards, and the stages
menu shows it as hidden by the answers given so far. Architect no longer offers an introduction section
for these stages. An Ego Form's heading is now the title of its form, which
Architect asks for in the form section.

Upgrading a protocol from schema 8 turns each introduction panel into an
Information stage just before its stage, with the panel's title and text.
The new stage copies the original stage's skip logic, and skip logic that
jumped to the original stage now jumps to the new one. An Ego Form's panel
title becomes the form's title, and its text, if any, becomes an Information
stage before it. The migration notes describe this in every supported
language.

For developers: `@codaco/protocol-validation` no longer exports
`IntroductionPanelSchema`, and the schema 9 Ego Form's `form` requires a
`title`. `SyntheticInterview` no longer takes introduction panel options.
