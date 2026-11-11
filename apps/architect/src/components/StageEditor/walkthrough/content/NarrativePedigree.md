<!--
  Walkthrough for the "Narrative Pedigree" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, scene:, dialog:, include:) say where a step
  points.
-->

# Narrative Pedigree

## What a narrative pedigree is

<!-- scene: narrative-pedigree-intro -->

The Narrative Pedigree shows the participant the family they drew on an earlier [Family Pedigree](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/family-pedigree), laid out as a conventional pedigree. When the participant picks a condition from the menu in the toolbar, each relative is marked with their status for that condition. Each status is worked out from who was nominated as having the condition and how they are related. A key beside the pedigree explains the symbols. Selecting a person highlights the relatives the condition could have passed through.

The stage turns the answers into a picture that a participant, researcher or clinician can talk through together.

Read the full [Narrative Pedigree documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/narrative-pedigree).

## What data it collects

<!-- scene: narrative-pedigree-data -->

This stage collects no data. It reads the family and the nominations recorded on the Family Pedigree, and writes nothing back to the participant's network. Picking conditions and selecting people leave your exported data exactly as it was.

**Save snapshot** saves an image of the pedigree and its key. The image is a file for the participant to keep, not interview data.

## When to use it

Use this stage to show a participant how a condition may run through their family, as a starting point for discussion.

> Do: Place the Narrative Pedigree after the Family Pedigree that feeds it, and record who is affected with one Family Pedigree nomination prompt per condition.

> Do: Use the Family Pedigree's completeness setting to require the relatives your conditions need. Missing parents and siblings leave statuses _Not known_ that a fuller family would establish.

## Choose the family to show

<!-- section: Pedigree source -->
<!-- field: sourceStageId -->
<!-- scene: narrative-pedigree-source -->

Pick the **Source stage**: the Family Pedigree whose family this stage draws. Only Family Pedigree stages that come before this one are offered.

Changing the source stage removes every condition you have added, because each condition reads that stage's nominations. Architect asks you to confirm first.

## Add the conditions

<!-- section: Disease mappings -->
<!-- field: diseases -->
<!-- scene: narrative-pedigree-conditions -->

The editor calls conditions diseases. Each condition you add appears in the menu on the participant's toolbar, drawn in its own color. Add at least one condition. Without any conditions, the participant sees an unmarked family.

> Do: Name conditions in words participants recognize. The name is all the participant sees of the condition's definition.

## Name the condition

<!-- dialog: =create disease | =edit disease -->
<!-- field: label -->

The **Disease label** is the condition's name. The participant picks the condition by this name in the toolbar menu, and the name is the title of a saved snapshot.

## Pick the condition's color

<!-- dialog: =create disease | =edit disease -->
<!-- field: color -->

The status symbols are drawn in this color while the participant has this condition chosen.

## Choose who has the condition

<!-- dialog: =create disease | =edit disease -->
<!-- field: attribute -->

Pick the true or false **Node attribute** that records who has the condition. A person is marked as having the condition when the attribute is true.

Only attributes recorded by a nomination prompt on the source Family Pedigree are listed. You can't create an attribute here. Add the nomination prompt to the Family Pedigree first.

## Choose how the condition is inherited

<!-- dialog: =create disease | =edit disease -->
<!-- field: inheritancePattern -->
<!-- scene: narrative-pedigree-patterns -->

The **Inheritance pattern** decides who else is marked: autosomal dominant or recessive, X-linked dominant or recessive, Y-linked, or mitochondrial. **Multifactorial** and **Unknown** mark only the people nominated, and infer nothing about anyone else.

Statuses pass only through genetic links (biological parents and egg or sperm donors). They do not pass through adoptive or social parents or surrogates. The sex-linked patterns use each person's sex assigned at birth. Gender identity plays no part.

> Avoid: Choosing an inheritance pattern for a condition whose inheritance is not established. Choose **Unknown** or **Multifactorial** instead, so that only recorded statuses are shown.

## Show possible statuses

<!-- section: At-risk statuses -->
<!-- field: showAtRiskStatuses -->
<!-- scene: narrative-pedigree-at-risk -->

Some statuses are certain, such as a relative nominated as having the condition, or a parent who must carry it because of their children. Other statuses are only possible, such as a relative who **may develop** or **may carry** the condition. Possible statuses are marked with a question mark.

Possible statuses are off by default. When **Show possible (at-risk) statuses** is off, relatives with only a possible status are shown as not known. Only the certain statuses appear.

> Avoid: Turning on possible statuses for participant-facing use without a clinician. Inferred "may develop" and "may carry" symbols can be mistaken for a diagnosis.

## Customize built-in wording

<!-- section: Customize built-in wording -->
<!-- scene: narrative-pedigree-snapshot -->

This section holds the words Network Canvas supplies for this stage: the **Save snapshot** button, the "Select a condition" choice in the menu, and the titles of saved snapshots. The zoom button labels, which this stage shares with the Family Pedigree, are under **Shared by every stage of this kind**.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
