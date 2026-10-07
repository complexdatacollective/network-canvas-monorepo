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
  variable's columns. Columns are compared as each format writes them, so two
  names that only become the same once written clash too: `close friend` and
  `close_friend` in GraphML, `=total` and `'=total` in CSV. Each conflict lists
  the `formats` it occurs in, and a clash between two different texts carries
  the column as written in `writtenColumn`.
- How the exports write a column name: `toGraphMLAttrName` replaces each
  character an XML name token can't hold with `_`, and `neutralizeCsvFormula`
  puts an apostrophe before text that starts with `=`, `+`, `-`, `@`, a tab or
  a carriage return.
- XML 1.0 character checks: `hasXmlIllegalCharacters`, `xmlIllegalCodePoints`
  and `stripXmlIllegalCharacters`.
- The export column names `appVersionProperty`, `commitHashProperty` and
  `graphMLLabelKey`.
