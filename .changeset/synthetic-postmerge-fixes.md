---
'@codaco/protocol-utilities': patch
'@codaco/architect': patch
---

Fix three defects in synthetic interview generation found after the redesign
landed.

A creator's declared `minNodes` is a floor the live interface enforces, and a
run beside a family pedigree was quietly building fewer people than it — a
completed session no participant could have produced. The population cap and
those floors are now reconciled in one allocation: each reachable pedigree's
required core is reserved before anything else, floors are weighed against what
those cores leave rather than against the raw cap, and a family's optional
growth is settled where it is built, against what the plan has genuinely left
unspent.

Edges inherited from a creator the session skipped are bounded by what the
inheriting stage itself declared. A density-1 sociogram behind a guard that
fired handed its whole edge set to a density-0.5 one, which had no way to give
the excess back.

Architect's synthetic data controls no longer rewrite a part-typed number to
zero. A number input reports an empty string for anything not yet a number — a
lone minus sign most of all — so a negative mean the schema permits could not
be typed at all, and clearing any of these parameters snapped it to a zero the
author never entered.
