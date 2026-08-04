---
"@codaco/interview": patch
"@codaco/interviewer": patch
"@codaco/architect": patch
---

Restore the full-size interview type scale on tablets.

The interview's viewport ramp for `--theme-root-size` bottomed out at `0.9rem`
for every viewport narrower than 1280px, so tablets — including all iPads —
rendered the participant interview at the smallest text size in the product
(14.4px base), with spacing and touch targets (checkboxes, radios) shrinking in
lockstep below recommended minimum sizes. The ramp is now piecewise: phones
(≤480px) keep the dense `0.9rem` base, tablets (768–1280px) get the full `1rem`
base — matching the interview's pre-July size and returning default form
controls to the 24px WCAG 2.5.8 minimum — and displays at 1280px and above are
unchanged.
