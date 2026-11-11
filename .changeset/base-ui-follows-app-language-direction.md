---
'@codaco/fresco-ui': minor
'@codaco/app-i18n': patch
---

Add `LocaleDirectionProvider` (`@codaco/fresco-ui/LocaleDirectionProvider`) and
the `useAppDirection` hook (`@codaco/app-i18n/react`). Mount the provider once
inside `AppI18nProvider` so that Base UI menus, sliders, tabs and popups follow
the writing direction of the app's language, as the page's layout already does.
Without an `AppI18nProvider` above them both read left to right.
