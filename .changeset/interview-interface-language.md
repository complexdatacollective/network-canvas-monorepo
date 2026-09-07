---
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Built-in interview controls, help, validation, dialogs and accessibility messages
are available in English, British English and Spanish. The interview menu now
includes an interface language chooser, with all messages available offline.

Hosts can pass a preference or an already negotiated language through
`Shell.requestedLocale`; the interview package finds the best match among its
own supported languages. `onLocaleChange` lets hosts persist menu choices, and
`InterviewI18nProvider` gives inline field previews the same negotiation and
catalogs. Language changes preserve entered answers, open forms and the current
interview position. Protocol-authored content and research values keep their
existing language and meaning.
