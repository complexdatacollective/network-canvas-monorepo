---
'@codaco/protocol-builder': minor
---

Every section of a stage editor now has a stable key, such as `filter-network` or `skip-logic`, that does not change with the section's wording or language. `BuilderSection` takes a required `sectionKey` prop, and the new `@codaco/protocol-builder/sections/sectionKeys` export lists every key (`SECTION_KEYS`, `SectionKey`). Hosts can recognise a section by its key: it is on the section's element as `data-section-key`, it is on each `StageSection` as `sectionKey`, and the `SectionHeaderActionContext` callback now receives `{ key, title }` instead of the title alone.
