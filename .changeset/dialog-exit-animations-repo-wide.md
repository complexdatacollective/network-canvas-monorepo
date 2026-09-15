---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
---

The last four dialogs that vanished instead of closing now animate out, and a
CI guard keeps the next one from regressing.

Dismissing a dialog used to remove it from the screen instantly, which read as
the screen flickering rather than as the dialog going away. Four were left after
the first pass: Interviewer's export dialog, its unlock and passphrase-recovery
dialogs, and Architect's report that a protocol has become invalid. All four now
close the way every other dialog does.

Nothing of a passphrase now outlives the dialog it was typed into. The unlock
dialogs hold their form outside the dialog itself, so keeping the dialog on
screen long enough to animate away also kept what had been typed into it; the
form is now emptied as the dialog closes.

Internal only: the repository's build-time scripts and CI guards move from
`scripts/build/` to `scripts/buildtime/`. Three separate ignore rules — git's,
the linter's and the formatter's — all match `**/build`, which meant those
fourteen files needed a forced `git add` to be committed at all and were never
linted or formatted; eight of them had drifted. Nothing emits to a `build`
directory in this repository, so the collision was the name alone.
