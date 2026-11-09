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

The Finish Screen is the last screen of an interview. It ends the interview, either once the participant confirms that they are finished or as soon as they reach it. The interview then shows its finished text, with no way to move back through the interview, and shows it again whenever the finished interview is opened.

Read the full [Finish Screen documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/finish-screen).

## What data it collects

<!-- scene: finish-session-data -->

It creates no nodes or edges and adds nothing to the participant's network. Finishing records two things with the interview: the time it finished, and the outcome you choose under **Outcome**.

Both are in your exported data. The CSV ego list has a `sessionFinish` column for the time and a `networkCanvasFinishOutcome` column for the outcome, which is `completed`, `ineligible` or `terminated`. GraphML files carry them as `nc:sessionFinishTime` and `nc:finishOutcome`. An interview that hasn't been finished leaves both columns empty, and GraphML leaves them out.

## When to use it

<!-- scene: finish-session-outcomes -->

Every protocol ends with a Finish Screen. Add another when some interviews should end differently, for example a Finish Screen for participants who don't qualify, with its own text and the outcome **Ineligible**.

Only Finish Screens can come after a Finish Screen, so they stay together at the end of the protocol. The interview reaches the first one. To send participants to a later one, choose it as the destination in an earlier stage's skip logic. A Finish Screen has no skip logic of its own, because every route through the interview ends at one.

> Avoid: Asking participants for any further information on the Finish Screen. Finishing locks in their answers, and the finished screen allows no more input, so any question has to come on an earlier stage.

## Let participants confirm

<!-- section: How participants finish -->
<!-- field: mode -->
<!-- scene: finish-session-intro -->

**Participants confirm** shows the closing screen with a **Finish** button. Pressing it asks the participant to confirm, and until they do, they can go back and change their answers. A new Finish Screen starts with this choice.

## Or finish automatically

<!-- section: How participants finish -->
<!-- field: mode -->
<!-- scene: finish-session-automatic -->

**Finish automatically** ends the interview as soon as the participant reaches this screen, and they can't go back from it. There is no closing screen, button or question, so the editor hides the **Closing screen** section and the confirmation question.

## Write the closing screen

<!-- section: Closing screen -->
<!-- field: content -->

**Closing text** is what the participant reads before they finish, above the **Finish** button. It is only shown when participants confirm. Start it with a heading, then the rest of the text.

A new Finish Screen starts with closing text Network Canvas supplies, which you can change. While participants confirm, the protocol can't be downloaded until it has closing text in your default language.

## Write the finished screen

<!-- section: Finished screen -->
<!-- field: finishedContent -->

**Finished text** is what the participant reads once the interview has finished, whichever way it finished. Like the closing text, it starts with a heading and begins with text Network Canvas supplies. The protocol can't be downloaded until it has finished text in your default language.

> Do: Write finished text that tells participants what happens next: that their answers have been saved, whether they can close the window, and, if it applies, how they will receive any compensation or follow-up.

> Avoid: Writing finished text that tells participants to go back and check their answers. Once the interview is finished they can't go back, so tell them to do it in the closing text, before they finish, or leave it out. When the interview finishes automatically, there is no closing text, so tell them on an earlier stage.

> Avoid: Telling participants to press an **Exit** or **Close** button in the text. Which action, if any, the finished screen offers depends on the app running the interview, and Fresco offers none.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section holds the words the participant reads while finishing, apart from the closing and finished text. Each starts with wording Network Canvas supplies in each of your protocol's languages that it has wording for. Switched off, the stage uses that wording; switch it on to change it.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

> Do: Check the closing text, the finished text and the words in **Customize built-in wording** in every language of your protocol. If you have added languages after changing the text, translate it in each one.

## Word the Finish button

<!-- section: Customize built-in wording -->
<!-- field: finishLabel -->

**Finish button** is the words on the button that ends the interview, _Finish_ unless you change it. The same words label the button that confirms. When the interview finishes automatically, the participant only sees the button if finishing fails, to try again.

## Word the confirmation question

<!-- section: Customize built-in wording -->
<!-- field: finishConfirmation -->

**Confirmation question** is asked after the participant presses the button, before the interview ends, such as _"Are you sure you want to finish the interview?"_. **Cancel** takes them back to the closing screen. It is only asked when participants confirm, so the editor only shows it then.

## Word the message for when finishing fails

<!-- section: Customize built-in wording -->
<!-- field: finishFailed -->
<!-- scene: finish-session-failed -->

**If finishing fails** is shown when the interview could not be finished, for example because the participant's latest answers could not be saved. When participants confirm, they stay on the closing screen and can press the button again. When the interview finishes automatically, the button appears so they can try again.

## Record how the interview ended

<!-- section: Outcome -->
<!-- field: outcome -->
<!-- scene: finish-session-outcomes -->

**How the interview ended** is saved with every interview that finishes at this screen and included in your exported data. Participants never see it.

- **Completed** (`completed`): the participant reached the normal end of the interview.
- **Ineligible** (`ineligible`): the participant did not qualify for the study.
- **Ended early** (`terminated`): the interview ended early for another reason, such as a distress or safety stop.

Preview records nothing, so the outcome only appears in data from real interviews.

> Do: Leave the outcome of the Finish Screen that ends a normal interview as **Completed**. Every interview that is finished at a Finish Screen is recorded with the outcome you choose there, so choose **Ineligible** or **Ended early** for a separate Finish Screen that only interviews ending that way reach.

<!-- include: interviewer-guidance -->

<!-- include: preview -->
