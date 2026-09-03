---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Text now sits on its caps and baseline instead of its line box. Headings, field labels, and every other use of the heading type style start their spacing at the cap line and end it at the baseline, and a field's label and hint carry the type scale's own margins to whatever follows them, and the labels of buttons, tabs, segmented switchers, and accordion triggers centre on their capital letters rather than on the invisible leading around them. Badges, pills, keyboard keys, and the Boolean field's option labels centre their caps the same way while keeping their line-box height, so their size is unchanged. Truncated and line-clamped headings keep their descenders. The new `text-box-trim` and `text-box-trim-keep-height` utilities carry the treatment; browsers without `text-box` support keep the previous rendering.
