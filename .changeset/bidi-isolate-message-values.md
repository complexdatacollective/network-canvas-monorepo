---
'@codaco/app-i18n': minor
'@codaco/shared-consts': minor
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Names and other text placed inside a sentence now keep their place in it when
the two run in different directions. In Arabic, a Latin name that ends in
punctuation or a number ("team-b!", "Wave 2") no longer has its punctuation
moved to the wrong end or swaps places with a nearby number; in English, an
Arabic or Hebrew name no longer pulls the words beside it out of order. This
covers the interface's own messages in every app and the protocol's messages
in the interview. English text with English names is unchanged.

`createAppIntl` and `AppI18nProvider` wrap each text value in Unicode
first-strong isolates (U+2068 … U+2069) when the sentence is right to left, or
when the value contains right-to-left text; numbers, dates and rich-text
values are left alone. `createAppIntl` takes an optional `direction`, which
defaults to the locale's own. `@codaco/app-i18n/messages` exports the
isolation helpers (`isolateArguments`, `isolatedArgumentNames`,
`withoutIsolates`), and `@codaco/shared-consts` exports `textDirectionOf`,
the direction a language tag is written in.
