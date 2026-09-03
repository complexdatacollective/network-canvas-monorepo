---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Text now sits on its caps and baseline instead of its line box. Headings, field labels, and every other use of the heading type style start their spacing at the cap line and end it at the baseline, and the labels of buttons, tabs, segmented switchers, accordion triggers, badges, pills, and keyboard keys centre on their capital letters rather than on the invisible leading around them. The new `text-box-trim` utility carries the treatment; browsers without `text-box` support keep the previous rendering.
