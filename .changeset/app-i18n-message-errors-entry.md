---
'@codaco/app-i18n': minor
---

Add `@codaco/app-i18n/message-errors`, an entry for code that refuses with
messages but renders nothing, such as a server. It exports `defineMessages`,
`createMessageError` and `formatMessageError` and loads no react-intl or React
at run time, so a server bundle that uses it does not carry React.
