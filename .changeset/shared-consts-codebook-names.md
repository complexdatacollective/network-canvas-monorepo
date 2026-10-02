---
'@codaco/shared-consts': major
---

Codebook IDs and the names researchers type now follow separate rules, so names
can use any script.

**Breaking:** `VariableNameSchema` is removed. Replace it according to what the
value is:

- A codebook record key (the ID a node type, edge type or variable is stored
  under) or another internal identifier: use `CodebookIdSchema`. It keeps the
  old `[a-zA-Z0-9._:-]` rule and also refuses `__proto__`.
- A name a researcher types (an entity type's name, a variable's name or an
  option value): use `CodebookNameSchema`. It accepts any script, spaces and
  punctuation. It refuses an empty name, leading or trailing whitespace, text
  not in Unicode NFC, lone surrogates, control characters (tab and line breaks
  included), and U+FFFE and U+FFFF. Store a typed name with
  `normalizeCodebookName`, which converts it to NFC and trims it.

New exports:

- Export column naming, shared by the exporters and the protocol editors:
  `categoricalOptionColumn`, `layoutColumn`, `variableExportColumnEntries`,
  `reservedExportColumns` and `findExportColumnConflicts`, with the types
  `ExportColumnFormat`, `ExportColumnEntity`, `ExportColumnVariable`,
  `LayoutColumnAxis`, `ExportColumnOrigin`, `ExportColumnEntry` and
  `ExportColumnConflict`. Call
  `findExportColumnConflicts({ entity, candidate, siblings })` to refuse a name
  whose exported columns would clash with a built-in column or with another
  variable's columns.
- XML 1.0 character checks: `hasXmlIllegalCharacters`, `xmlIllegalCodePoints`
  and `stripXmlIllegalCharacters`.
- The export column names `appVersionProperty`, `commitHashProperty` and
  `graphMLLabelKey`.
