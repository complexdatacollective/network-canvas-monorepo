---
'@codaco/fresco-ui': patch
---

Fix the empty DatePicker's hint text rendering with a greenish tint in
Safari on dark backgrounds: WebKit repaints the empty day/month/year
sub-fields with its own contrast-adjusted color unless
`-webkit-text-fill-color` pins them. Blink already honoured the `color`
property, so Chrome is unchanged.
