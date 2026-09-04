---
'@codaco/studio-server': minor
'@codaco/studio-rpc': minor
---

Researchers can have a language preference stored on their account, so the
language they choose follows them to any device they sign in on rather than
living only in the browser that set it.

The preference is optional: an account that has never chosen one has no
stored value, and the interface falls back to the languages the browser asks
for. Only languages Studio actually supports can be stored.
