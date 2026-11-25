---
'@codaco/documentation': patch
---

The Protocol Schema Information page explains the ids in a schema 9 protocol. Every stage, prompt, panel, form field, filter rule and other item a stage keeps in a list has an id that is a UUID used only once in the protocol. The page says that an upgrade from schema 8 gives every one of them a new id, and that Architect assigns ids for you. It also explains that the ids of node types, edge types and variables are UUIDs, that an upgrade keeps the ids that are already UUIDs and replaces the others without changing any names, and that a roster file's column headings match variables by id or by name. Each option of a categorical or ordinal attribute also has an id, which an upgrade works out from the option's attribute and value, so upgrading the same protocol twice gives each option the same id both times. The page also describes how piped text is written in the protocol file: each placeholder names its value directly by id, such as `{ego_<id>}` or `{node_label}`, and a version of the text for an answer is named by the option's id, or by `true` and `false`. It no longer refers to a stage's `dynamicValues`.

The Piped Text page lists the problems that Architect now reports in piped text. A message names a value as the researcher knows it, such as the attribute's name, and never by its id. The rules for short names, the `participant` case and the yes and no cases are replaced by the rules for ids, `true` and `false`. The page also says that the translation table offers every value that the stage editor offers, and that a categorical answer with several options uses the version of the first option in the codebook's order.

Both pages are updated in English, Spanish and French.
