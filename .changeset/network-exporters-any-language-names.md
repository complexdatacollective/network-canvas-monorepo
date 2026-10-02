---
'@codaco/network-exporters': minor
---

Exports handle names in any script without losing data, and report what they
had to change to do so.

`ExportReturn` has a new `warnings: ExportWarning[]` field. `ExportWarning`,
from `@codaco/network-exporters/output`, is a union on `kind`:

- `'xml-illegal-characters'`: a session's answers held characters XML 1.0 can't
  carry, and they were removed from its GraphML files only. Carries
  `sessionId`, `caseId`, `variables` and `caseIdChanged`.
- `'xml-illegal-characters-in-protocol'`: the protocol's name, a node or edge
  type's name, or a column name held such characters. Carries `protocolName`,
  `text`, `name` and `removed`.
- `'column-renamed'`: two columns in one file would have shared a name, so the
  later one was written as `renamedTo`. Carries `protocolName`, `format`,
  `entity`, `entityTypeName`, `variable` and `column`.

`exportWarningKey` and `uniqueExportWarnings` identify and de-duplicate
warnings. `formatExportWarnings(intl, warnings)`, from
`@codaco/network-exporters/messages`, groups them into localized
`ExportWarningGroup`s (`kind`, `title`, `description`, `items`) ready to show.

What the exports now do:

- Export file names keep the entity type's name in any script. Only
  `/ \ : * ? " < > |`, control characters and trailing dots and spaces are
  removed, a name Windows reserves (`CON`, `NUL`, ...) is prefixed with `_`,
  and a name is cut to fit 255 bytes. Names that would be equal ignoring case
  and Unicode normalization, or that lost their type name when cut, get the
  type's codebook ID as a `_<typeId>` suffix (an ID longer than 64 bytes is
  replaced by a digest of it, so the name still fits). Before, every character other
  than `[A-Za-z0-9_]` was stripped, so a type named `Close-Friend` now exports
  to `..._Close-Friend.csv` rather than `..._CloseFriend.csv`, and types whose
  names collided wrote over each other.
- The zip output (`@codaco/network-exporters/layers/ZipOutput`) refuses an
  entry whose name matches an earlier one ignoring case and Unicode
  normalization, and fails the export instead of writing the duplicate.
- Columns that would share a name in one file, as a CSV header or a GraphML
  `attr.name`, are renamed `_2`, `_3`, ... in codebook order, with a
  `'column-renamed'` warning. Built-in columns keep their names. Before, CSV
  merged them and one variable's values were lost.
- GraphML `attr.name` is an XML name token, so a character it can't hold (a
  space, `(`, `/`, ...) is replaced with `_`, and the name as written is kept
  in the key's `<desc>`.
- Characters XML 1.0 forbids (C0 controls other than tab, line feed and
  carriage return, unpaired surrogates, U+FFFE and U+FFFF) are stripped from
  the finished GraphML document, with a warning. CSV output keeps the data
  unchanged.
- CSV header cells keep the formula-guard apostrophe, since a name can now
  begin with `=`, `+`, `-` or `@`. Headers are compared as written, apostrophe
  included, so a variable named `=total` and one named `'=total` are renamed
  apart rather than sharing a column.
- Variables, attributes and entity types whose IDs are `Object.prototype` keys
  (`constructor`, `toString`, ...) are looked up as own properties, so their
  values are exported instead of being dropped or read from the prototype.
