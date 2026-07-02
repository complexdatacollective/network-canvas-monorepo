---
'@codaco/fresco-ui': minor
---

Add a `suppressPasswordManager` prop to `PasswordField`. When set, the masked
value renders as a text input using `-webkit-text-security` instead of
`type="password"`, so browser password managers never treat it as a website
credential — no save prompts, no username association, no autofill. Intended
for app-internal secrets (device PINs, vault passphrases). Falls back to a
real password input where the CSS property is unsupported (e.g. Firefox).
