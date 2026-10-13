---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/protocol-utilities': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Ordinal and categorical bin stages can now require the participant to place
every node before they move on. The setting is off by default, so existing
stages behave as before.

**Protocols (`@codaco/protocol-validation`)**

- Schema 9 bin stages' `behaviours` object takes an optional
  `requireCompletePlacement`.
- A bin stage with `requireCompletePlacement: true` needs an
  `unplacedNodesNotice`: the message the participant sees when they try to
  continue with a node still unplaced. Network Canvas supplies this text in
  English, German, Spanish, French, Italian, Dutch, Brazilian Portuguese and
  Simplified and Traditional Chinese, and `missingSuppliedStageText` seeds it
  like the other supplied stage wording. With the setting off, the notice is
  an inapplicable setting.

**Interview runtime (`@codaco/interview`)**

- With the setting on, Next is refused on each prompt until every node is in
  a bin, and the stage's notice is shown. Going back is never blocked. The
  refusal is recorded as a `stage_validation_failed` event of kind
  `unplaced_nodes`.

**Synthetic interviews (`@codaco/protocol-utilities`)**

- `addStage` accepts `behaviours.requireCompletePlacement` for bin stages.

**Architect**

- The **Placing nodes** section of both bin stage editors has a **Require
  every node to be placed** switch. Turning it on shows the participant's notice,
  filled in with Network Canvas's text. The protocol summary prints the
  notice.

**Interviewer and Fresco**

- Interviews follow the setting on stages that use it.
