---
'@codaco/interview': patch
---

Fix two data-integrity bugs surfaced by the interview e2e suite. The
`encryptedVariables` experiment is now the single master switch for name
encryption: `NameGenerator`/`NameGeneratorRoster` no longer write ciphertext
when the experiment is off, keeping the write path aligned with the
experiment-gated decrypt path (previously an encrypted variable produced
undecryptable stored values). `Anonymisation`'s before-next gate now calls
`form.requestSubmit()` instead of the native `form.submit()`, so validation runs
and the SPA is not GET-navigated to `/?passphrase=…` — which had ejected the
participant from the interview whenever they pressed Next on an invalid form.
