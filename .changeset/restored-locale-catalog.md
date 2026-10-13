---
'@codaco/app-i18n': minor
---

`useLocaleCatalog` takes an optional fourth argument, `restored`: a locale the
host brought back from storage after mounting, such as a language chosen
before a reload. While the requested locale is the restored one, the hook
suspends until its catalog has loaded, as it does on a first load, instead of
keeping the language already on screen. Text the host words from elsewhere
then changes language in the same render as the catalog. If the restored
locale cannot be loaded, the language on screen stays and the failure is
reported as before.
