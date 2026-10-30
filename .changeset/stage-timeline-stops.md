---
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/fresco-ui': minor
---

Lists of stages now show each stage as a stop on a timeline, in its stage type's colour and icon, as the timeline on Architect's start screen does. They no longer show a screenshot of each interface.

**Interview**

- The menu for moving to another screen lists the stages as a numbered timeline. Each stage has a stop in its colour and icon, and the line between two stops takes the colour of the stage above. Participants see each stage's name only, not the name of the interface it uses.
- The package no longer includes the interface screenshots, so it and the apps that bundle it are smaller.

**Architect**

- The protocol timeline shows each stage as a coloured stop with a card beside it giving the stage's name and the interface it uses. The cards alternate sides of the line, as on the start screen, and the line between two stops takes the colour of the stage above. In a narrow window every card sits after its stop.
- Architect no longer downloads every interface screenshot when it starts. The stage editor and the new-stage screen still show them.

**Interviewer**

- Interviewer no longer stores the interface screenshots for offline use, since no screen shows them any more, so installing it downloads less.

**Fresco UI (`@codaco/fresco-ui`)**

- Adds `StageTypeBadge` (`stages/StageTypeBadge`), a stage type's icon on a disc of its colour in four sizes, with an optional white ring for dark pages and timelines.
- Adds `stageColorStyle` and `stageIcon` to `stages/stageTypes`. They take any stage's `type` and give one this build does not know a neutral grey and a generic icon.
- Exports the `CSSVariablesStyle` type from `utils/cssVariables`, for typing inline CSS custom properties.
