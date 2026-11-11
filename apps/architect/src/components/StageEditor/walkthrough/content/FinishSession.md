<!--
  Walkthrough for the "Finish Screen" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (FinishSession.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images, > quotes).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: Participant prompts" wrapped in an HTML comment:
      section: <title>   highlight and scroll to the editor section whose
                         title this is
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
      dialog: <text>     a step for a dialog, not the editor: it is shown
                         only while a dialog whose title matches is open.
                         "form field" matches any title containing it
                         ("Create form field", "Edit form field");
                         "=attribute" matches a title that is exactly that;
                         alternatives are separated by "|". Dialog steps
                         play in order while it is open, and each dialog
                         keeps its place while another is opened from
                         inside it. The last one asks the researcher to
                         save (naming the dialog's own save button, e.g.
                         "Add") and rings that button, or, for a dialog
                         with no save button, to make their choice; once
                         the dialog closes the walkthrough picks up where
                         it was. Their "field:" looks inside the dialog.
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (node type, skip logic, interviewer guidance and
    so on); edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Finish Screen

## What a Finish Screen is

<!-- scene: finish-session-intro -->

The Finish Screen is the last screen of an interview. It ends the interview, either when the participant confirms that they are finished or as soon as they reach it. After that, the participant sees the finished text and can't go back through the interview. The same finished text appears whenever the finished interview is opened again.

Read the full [Finish Screen documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/finish-screen).

## What data it collects

<!-- scene: finish-session-data -->

This stage creates no nodes or edges, and adds nothing to the participant's network. It records two things: when the interview finished, and how it ended. How it ended is the outcome you choose under **Outcome**.

Both appear in your exported data. The CSV ego list has a `sessionFinish` column for the time and a `networkCanvasFinishOutcome` column for the outcome, which is `completed`, `ineligible` or `terminated`. GraphML files include them as `nc:sessionFinishTime` and `nc:finishOutcome`. If an interview hasn't been finished, both CSV columns are empty and GraphML leaves them out.

## When to use it

<!-- scene: finish-session-outcomes -->

Every protocol ends with a Finish Screen. Add another one when some interviews should end differently, such as a Finish Screen for participants who don't qualify, with its own text and the outcome **Ineligible**.

Only Finish Screens can come after a Finish Screen, so they stay together at the end of the protocol. Participants who reach the end of the interview arrive at the first Finish Screen. To send participants to a later one, choose it as the destination in an earlier stage's skip logic. A Finish Screen has no skip logic of its own, because every route through the interview ends at one.

> Avoid: Asking participants for any further information on the Finish Screen. Finishing locks in their answers, and the finished screen allows no more input, so any question has to come on an earlier stage.

## Let participants confirm

<!-- section: How participants finish -->
<!-- field: mode -->
<!-- scene: finish-session-intro -->

With **Participants confirm** selected, the closing screen shows a **Finish** button. Pressing it asks the participant to confirm, and until they do, they can still go back and change their answers. This option is the default for a new Finish Screen.

## Or finish automatically

<!-- section: How participants finish -->
<!-- field: mode -->
<!-- scene: finish-session-automatic -->

**Finish automatically** ends the interview as soon as the participant reaches this screen, and the participant can't go back from it. There is no closing screen, button or confirmation question, so the editor hides the **Closing screen** section and the **Confirmation question** field.

## Write the closing screen

<!-- section: Closing screen -->
<!-- field: content -->

**Closing text** is what the participant reads before they finish, above the **Finish** button. It is shown only when the **Participants confirm** option is selected. Start the closing text with a heading, then add the rest of the text.

A new Finish Screen starts with closing text that Network Canvas supplies, which you can change. When the **Participants confirm** option is selected, the protocol can't be downloaded until it has closing text in your default language.

## Write the finished screen

<!-- section: Finished screen -->
<!-- field: finishedContent -->

**Finished text** is what the participant reads once the interview has finished, however it finished. Like the closing text, it starts with a heading. A new Finish Screen starts with finished text that Network Canvas supplies. The protocol can't be downloaded until it has finished text in your default language.

> Do: Write finished text that tells participants what happens next: that their answers have been saved, whether they can close the window, and, if it applies, how they will receive any compensation or follow-up.

> Avoid: Writing finished text that tells participants to go back and check their answers. Once the interview is finished they can't go back, so tell them to do it in the closing text, before they finish, or leave it out. When the interview finishes automatically, there is no closing text, so tell them on an earlier stage.

> Avoid: Telling participants to press an **Exit** or **Close** button in the text. Which action, if any, the finished screen offers depends on the app running the interview, and Fresco offers none.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section holds the wording the participant reads while finishing, apart from the closing text and the finished text. Network Canvas supplies starting wording for each item, in each of your protocol's languages that it has wording for. While the section is switched off, the stage uses Network Canvas's wording. Switch the section on to change it.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

> Do: Check the closing text, the finished text and the words in **Customize built-in wording** in every language of your protocol. If you have added languages after changing the text, translate it in each one.

## Word the Finish button

<!-- section: Customize built-in wording -->
<!-- field: finishLabel -->

**Finish button** sets the label of the button that ends the interview, which reads _Finish_ unless you change it. The same label is used for the button that confirms in the confirmation question. When the interview finishes automatically, the participant sees the button only if finishing fails, so that they can try again.

## Word the confirmation question

<!-- section: Customize built-in wording -->
<!-- field: finishConfirmation -->

**Confirmation question** is the question asked after the participant presses the **Finish** button and before the interview ends, such as _"Are you sure you want to finish the interview?"_. **Cancel** takes the participant back to the closing screen. The question is asked only when the **Participants confirm** option is selected, so the editor shows this field only for that option.

## Word the message for when finishing fails

<!-- section: Customize built-in wording -->
<!-- field: finishFailed -->
<!-- scene: finish-session-failed -->

**If finishing fails** is the message shown when the interview can't be finished, for example because the participant's latest answers could not be saved. When the **Participants confirm** option is selected, the participant stays on the closing screen and can press the **Finish** button again. When the interview finishes automatically, the **Finish** button appears so the participant can try again.

## Record how the interview ended

<!-- section: Outcome -->
<!-- field: outcome -->
<!-- scene: finish-session-outcomes -->

**How the interview ended** is saved with every interview that finishes at this screen, and is included in your exported data. Participants never see it.

- **Completed** (`completed`): the participant reached the normal end of the interview.
- **Ineligible** (`ineligible`): the participant did not qualify for the study.
- **Ended early** (`terminated`): the interview ended early for another reason, such as a distress or safety stop.

Preview records nothing, so the outcome only appears in data from real interviews.

> Do: Leave the outcome of the Finish Screen that ends a normal interview as **Completed**. Every interview that is finished at a Finish Screen is recorded with the outcome you choose there, so choose **Ineligible** or **Ended early** for a separate Finish Screen that only interviews ending that way reach.

<!-- include: interviewer-guidance -->

<!-- include: preview -->
