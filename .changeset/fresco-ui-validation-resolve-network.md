---
'@codaco/fresco-ui': minor
---

A form's `ValidationContext` can now carry `resolveNetwork`, a function that
supplies the network to compare against when `network` does not hold it yet,
such as while stored values are still being decrypted. A field's validation
waits for it, and its comparison rules (such as `unique`, `sameAs` and
`differentFrom`) and custom validators then see the network it resolves to. If
it rejects, the field fails validation with an error rather than being checked
against `network`. When the rejection's message is a message error made with
`createMessageError`, the field shows that message as the reason.
