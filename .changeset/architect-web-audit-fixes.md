---
'@codaco/architect-web': patch
---

Pre-release audit fixes across the protocol designer. Your work is protected in
more places: the undo history no longer quietly fills up browser storage, an
interrupted export now tells you which resources were skipped instead of failing
silently, exported protocols keep same-named resources distinct, and reloading
for an update warns you before discarding an in-progress edit. Deleting and
editing entries in the codebook is safer — encrypted variables stay encrypted,
in-use resources can no longer be removed by mistake, and clearer prompts appear
when a change would affect another part of your protocol. The Family Pedigree,
Narrative Pedigree, and Network Composer editors handle diseases, edge types,
labels, and source-stage changes correctly, and previewing is more robust
(clearer errors instead of a preview that never loads). Option labels no longer
pick up stray blank lines. Privacy is tightened: analytics no longer transmits
your protocol's text, and a Content-Security-Policy is applied to the deployed
app.
