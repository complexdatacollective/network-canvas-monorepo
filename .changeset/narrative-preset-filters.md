---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Each preset of a Narrative stage can now have its own filter, so one stage can
show a different part of the network in each preset: everyone in one view, and
only family members in the next.

**Protocols (`@codaco/protocol-validation`)**

- In schema 9 a Narrative stage has no `filter` of its own. Each entry of
  `presets` takes an optional `filter` instead, with the same rules as a stage
  filter.
- Migrating a protocol to schema 9 copies a Narrative stage's filter to every
  preset of that stage and removes it from the stage, so each preset shows the
  same people as before.

**Synthetic protocols (`@codaco/protocol-utilities`)**

- `addPreset` takes a `filter` for the preset.

**Interview runtime (`@codaco/interview`)**

- A Narrative shows the people and connections the current preset's filter
  leaves, and switching presets switches filters. A Narrative stage is left
  out of the interview only when no preset has anyone to show.

**Architect**

- The Narrative editor's **Stage filter** section is replaced by a **Preset
  filter** in each preset. The protocol summary prints each preset's filter
  with that preset.
