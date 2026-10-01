---
'@codaco/app-i18n': minor
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/protocol-validation': minor
'@codaco/network-exporters': minor
'@codaco/protocol-utilities': minor
'@codaco/shared-consts': minor
'@codaco/site-navigation-element': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Traditional Chinese (繁體中文, `zh-Hant`) is now available as an interface
language in Architect, Interviewer and Fresco, written in Taiwan-standard
vocabulary. Choose it from the language setting, or let it be selected
automatically: browsers set to Chinese for Taiwan, Hong Kong or Macau now get
Traditional Chinese instead of Simplified Chinese, while other Chinese browser
languages still get Simplified Chinese. The built-in interview controls
participants see are translated too; protocol content keeps the language it
was written in.

For host apps, `resolveAppLocale` from `@codaco/app-i18n` now matches Chinese
requests by script, so a browser that sends `zh-HK, zh` resolves to `zh-Hant`
rather than letting the generic `zh` behind it pick `zh-Hans`. The rule lives in
`toScriptMatchingTag` from `@codaco/shared-consts`, which the website uses too.
