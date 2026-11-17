<!--
  Walkthrough for the "Narrative Pedigree" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, control:, scene:, include:) say where a step
  points.
-->

# Narrative Pedigree

## What a narrative pedigree is

<!-- scene: narrative-pedigree-intro -->

The Narrative Pedigree shows the participant the family they drew on an earlier [Family Pedigree](https://documentation.networkcanvas.com/design-protocols/interface-documentation/family-pedigree), laid out as a conventional pedigree. When the participant picks a condition from the menu in the toolbar, each relative is marked with their status for that condition. Each status is worked out from who was nominated as having the condition and how they are related. A key beside the pedigree explains the symbols. Selecting a person highlights the relatives the condition could have passed through.

The stage turns the answers into a picture that a participant, researcher or clinician can talk through together.

Read the full [Narrative Pedigree documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/narrative-pedigree).

## When to use it

Use this stage to show a participant how a condition may run through their family, as a starting point for discussion.

> Do: Place the Narrative Pedigree after the Family Pedigree that feeds it, and record who is affected with one Family Pedigree nomination prompt per condition.

> Do: Use the Family Pedigree's completeness setting to require the relatives your conditions need. Missing parents and siblings leave statuses _Not known_ that a fuller family would establish.

## Choose the family to show

<!-- section: pedigree-source -->
<!-- field: sourceStageId -->
<!-- scene: narrative-pedigree-source -->

Pick the **Source stage**, which is the Family Pedigree whose family this stage draws. Only Family Pedigree stages that come before this one are offered.

Changing the source stage removes every condition you have added, because each condition reads that stage's nominations. Architect asks you to confirm first.

## Add the conditions

<!-- section: disease-mappings -->
<!-- field: diseases -->
<!-- scene: narrative-pedigree-conditions -->

The editor calls conditions diseases. Each condition you add appears in the menu on the participant's toolbar, drawn in its own color. Add at least one condition, because without any, the participant sees an unmarked family.

Each condition reads a true or false attribute recorded by a nomination prompt on the source Family Pedigree, so add that prompt first. Its **Inheritance pattern** decides who else is marked. Statuses pass only through genetic links, and the sex-linked patterns use sex assigned at birth.

> Do: Name conditions in words participants recognize. The name is all the participant sees of the condition's definition.

> Avoid: Choosing an inheritance pattern for a condition whose inheritance is not established. Choose **Unknown** or **Multifactorial** instead, so that only recorded statuses are shown.

## Show possible statuses

<!-- section: at-risk-statuses -->
<!-- field: showAtRiskStatuses -->
<!-- scene: narrative-pedigree-at-risk -->

Some statuses are certain, such as a relative nominated as having the condition, or a parent who must carry it because of their children. Other statuses are only possible, such as a relative who **may develop** or **may carry** the condition. Possible statuses are marked with a question mark.

Possible statuses are off by default. While **Show possible (at-risk) statuses** is off, relatives with only a possible status are shown as not known, so only the certain statuses appear.

> Avoid: Turning on possible statuses for participant-facing use without a clinician. Inferred "may develop" and "may carry" symbols can be mistaken for a diagnosis.

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
