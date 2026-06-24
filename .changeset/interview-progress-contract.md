---
'@codaco/interview': minor
---

Expose participant-facing interview progress through the step-change contract.

`@codaco/interview` appends a synthetic `FinishSession` stage to every interview, so the host-controlled `currentStep` indexes a list of length `P + 1`. Hosts that wanted to show progress had to re-derive it and independently account for that appended stage, which drifted from what the participant actually saw (complexdatacollective/Fresco#801).

- `onStepChange` now receives a second argument, `StepChangeMeta` (`{ progress, totalSteps }`), carrying the 0–100 participant-facing progress and the true total step count (including the finish stage). Existing single-argument handlers remain compatible.
- A new pure helper `getInterviewProgress(stages, currentStep)` computes the same `{ progress, totalSteps }` from a protocol's stages, for hosts that need progress offline (e.g. synthetic data) without knowing about the appended finish stage.
