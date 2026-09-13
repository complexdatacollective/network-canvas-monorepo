# Timing runtime delivery audit

Audited commit: `0f59fde47a275e7e53e6d9275ef1b1447b60f471`.

## Changeset decision

This belongs to the normal release lane. The existing
`.changeset/timing-runtime-persistence.md` already names `@codaco/interview` and
its required bundled runtime dependents: `@codaco/architect`,
`@codaco/interviewer`, and `fresco`. The timing transport was introduced by
`846af0cd2`; neither that commit nor the reviewed parent is on `origin/main`,
and no release tag for those four packages contains the introduction. The
review fixes an unreleased feature, so the existing changeset was clarified
rather than adding a second release note.

## Rendered-pixel classification

The visual classifier returned `REVIEW` for Interview and its host apps because
the stacked branch has 1,478 changed paths relative to its comparison base.
The exact audited commit changes timing lifecycle dispatch, Redux persistence,
server validation, contract comments, and tests. It changes no rendered JSX,
styles, copy, assets, layout, or visual state. Fresco's route change is
server-only. Interview, Architect, and Interviewer therefore require no visual
baseline regeneration for this commit.

## Bounded duration semantics

Persisted `stageTiming.totalDurationMs` equals the sum of the latest 10,000
retained authored-stage exits. It is a bounded observation-window total after
compaction, not lossless lifetime storage. The completion analytics ref is not
pruned during one loaded runtime, so its event can retain that runtime's full
active duration. After a reload, it can seed only from persisted retained
history and cannot reconstruct older discarded intervals.
