---
'@codaco/protocol-validation': minor
---

Export `assetSourceSchema`, the rule an asset manifest entry's `source` is
already validated by: a filename with no path separators and no `..`, because
that string becomes a zip entry name when a protocol is exported. A host that
stages a file can now refuse an unsafe name where the file arrives, rather than
accepting it and producing a protocol that cannot be published.
