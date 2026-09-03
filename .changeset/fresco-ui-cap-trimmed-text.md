---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Text now sits on its caps and baseline instead of its line box. Button labels, segmented switcher and tab labels, badges, pills, keyboard keys, and node labels centre on their capital letters rather than on the invisible leading around them, and headings and field labels start their spacing at the cap line and end it at the baseline. The new `text-box-trim` utility carries the treatment; browsers without `text-box` support keep the previous rendering.
