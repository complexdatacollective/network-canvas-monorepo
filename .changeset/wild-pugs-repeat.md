---
'@codaco/fresco-ui': patch
---

The `menu-sociogram` icon now honours the `--icon-tone-primary` and `--icon-tone-secondary` custom properties, so consumers can recolour it. It previously hardcoded platinum fills, which silently ignored any tone override. The default appearance is unchanged.
