# @codaco/sample-protocol

## 1.0.4

### Patch Changes

- cd75518: Require an answer in the bundled protocols' quick-add and "other" fields

  Quick-add name generators and the follow-up question behind a categorical bin's
  "other" option used to require an answer on their own. They now follow the
  validation set on the attribute they write to, and upgrading a protocol to
  schema 8 adds `required` to those attributes so nothing changes for existing
  studies. The protocols bundled with Architect and Interviewer were never
  upgraded that way, so participants could leave these fields blank. The sample
  protocol, the development protocol and the Colored Eco-Genetic Relationship Map
  (CEGRM) template now require an answer in those fields again.

## 1.0.3

### Patch Changes

- b467615: Add forward skip destinations to schema 8, shared skip evaluation, synthetic
  network generation, and the interview runtime. Hidden stages can now continue
  at a later stage or route to the interview finish screen, with live route
  recalculation, safe Back navigation, and confirmed one-screen overrides for
  unavailable stages.

  Also keep shared Select fields correctly labelled and contained when option
  labels are long. The bundled sample protocol now ends the interview when a
  participant declines consent.

## 1.0.2

### Patch Changes

- 4c994ec: Re-encode the bundled video stimulus assets (H.264, CRF 24) to cut their size by
  ~88% (~16.5 MB -> ~2 MB) with no visible quality change (SSIM ~0.998). Same
  filenames, container, and codec, so consumers need no changes.

## 1.0.1

### Patch Changes

- d96450e: Bring the bundled protocols into conformance with the current schema 8 so they open in Architect without a "Protocol Validation Failed" dialog. These protocols are tagged schema version 8, so the open path skips migration and stale legacy keys are never stripped.
  - Sample Protocol: removed `size` from Information **text** items (schema 8 only allows `size` on asset items).
  - Development Protocol: removed `size` from text items, dropped the no-longer-supported `form.title` on the ego/alter/alter-edge forms, removed the unused `loop` flag on the `withSound` asset, dropped the `highlight` block from the Sociogram prompt that also created edges (the two are mutually exclusive), and renamed the venue node type's `name_variable` to `venue_name_variable` so variable record keys are unique across entity types.
