<!--
  Walkthrough for the "Finish Screen" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (FinishSession.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images, > quotes).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: prompts" wrapped in an HTML comment:
      section: <key>     highlight and scroll to the editor section with this
                         key (its data-section-key; the keys are listed in
                         protocol-builder's sections/sectionKeys.ts)
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      control: <name>    highlight a control outside the sections instead
                         (only "preview": the toolbar's Preview button)
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (skip logic, interviewer guidance and so on);
    edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Finish Screen

## What a Finish Screen is

<!-- scene: finish-session-intro -->

The Finish Screen is the last screen of an interview. It ends the interview, either when the participant confirms that they are finished or as soon as they reach it. After that, the participant sees the finished text and can't go back through the interview. The same finished text appears whenever the finished interview is opened again.

Read the full [Finish Screen documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/finish-screen).

## When to use it

<!-- scene: finish-session-outcomes -->

Every protocol ends with a Finish Screen. Add another one when some interviews should end differently, such as when participants don't qualify or decline consent.

Only Finish Screens can come after a Finish Screen, so they stay together at the end of the protocol. Participants who reach the end of the interview arrive at the first Finish Screen. To send participants to a later one, choose it as the destination in an earlier stage's skip logic.

> Do: Add multiple finish screens with customised wording to reflect the different ways a participant might end the interview.

## Let participants confirm

<!-- section: finish-mode -->
<!-- field: mode -->
<!-- scene: finish-session-intro -->

With **Participants confirm** selected, the closing screen shows a **Finish** button. Pressing it asks the participant to confirm, and until they do, they can still go back and change their answers. This option is the default for a new Finish Screen.

> Do: Use this setting when you want the participant to be in control of when they submit their answers. This is particularly relevant for self-administration.

## Or finish automatically

<!-- section: finish-mode -->
<!-- field: mode -->
<!-- scene: finish-session-automatic -->

**Finish automatically** ends the interview as soon as the participant reaches this screen, and the participant can't go back from it. There is no closing screen, button or confirmation question, so the editor hides the **Closing screen** section and the **Confirmation question** field.

> Do: Use this to immediately prevent the participant from further interacting with the interview in any way, such as if they have indicated emotional distress.

> Avoid: Using this in any scenario where a participant may need to revisit earlier stages or revise answers.

## Write the closing screen

<!-- section: closing-screen -->
<!-- field: content -->

**Closing text** is what the participant reads before they finish, above the **Finish** button. It is shown only when the **Participants confirm** option is selected. Start the closing text with a heading, then add the rest of the text.

A new Finish Screen starts with closing text that Network Canvas supplies, which you can change.

## Write the finished screen

<!-- section: finished-screen -->
<!-- field: finishedContent -->

**Finished text** is what the participant reads once the interview has finished, however it finished. Like the closing text, it starts with a heading. A new Finish Screen starts with finished text that Network Canvas supplies.

> Do: Write finished text that tells participants what happens next: that their answers have been saved, whether they can close the window, and, if it applies, how they will receive any compensation or follow-up.

> Avoid: Writing finished text that tells participants to go back and check their answers. Once the interview is finished they can't go back, so tell them to do it in the closing text, before they finish, or leave it out.

<!-- include: built-in-wording -->

## Record how the interview ended

<!-- section: outcome -->
<!-- field: outcome -->
<!-- scene: finish-session-outcomes -->

**How the interview ended** is saved with every interview that finishes at this screen, and is included in your exported data. Participants never see it.

- **Completed** (`completed`): the participant reached the normal end of the interview.
- **Ineligible** (`ineligible`): the participant did not qualify for the study.
- **Ended early** (`terminated`): the interview ended early for another reason, such as a distress or safety stop.

> Do: Leave the outcome of the Finish Screen that ends a normal interview as **Completed**. Every interview that is finished at a Finish Screen is recorded with the outcome you choose there, so choose **Ineligible** or **Ended early** for a separate Finish Screen that only interviews ending that way reach.

<!-- include: interviewer-guidance -->

<!-- include: preview -->
