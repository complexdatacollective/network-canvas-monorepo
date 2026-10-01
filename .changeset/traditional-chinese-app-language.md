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

Chinese browser languages are now matched by script rather than by region.
`resolveAppLocale` in `@codaco/app-i18n` maps each Chinese tag to its script
first, so Hong Kong (`zh-HK`) and Macau (`zh-MO`) resolve to Traditional
Chinese even when the browser also sends a generic `zh`, which previously won
Simplified Chinese. `@codaco/shared-consts` exports the rule as
`toScriptMatchingTag`, which the website uses too. A registry that declares a
regional Chinese tag such as `zh-TW` exactly still receives that tag.
