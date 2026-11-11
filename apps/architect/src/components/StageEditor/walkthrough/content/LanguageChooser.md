<!--
  Walkthrough for the "Language Chooser" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (LanguageChooser.md).
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

# Language Chooser

## What a Language Chooser is

<!-- scene: language-chooser-intro -->

The Language Chooser is a screen where the participant chooses the language for the rest of the interview. They choose from the languages your protocol is written in. The screen shows a heading above a list of those languages. Each language is written in its own language, and the language the interview is currently in is already selected.

When the participant chooses a language, this screen and every screen after it switch to that language straight away. The participant can change their mind before moving on, and can move on without choosing anything.

Read the full [Language Chooser documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/language-chooser).

## What data it collects

<!-- scene: language-chooser-data -->

This stage collects no data. It creates no nodes or edges, and the participant's choice is not saved with the interview or included in your exported data.

The choice is kept in the browser tab running the interview, so it lasts if the page reloads. If the interview is resumed in another tab or on another device, it uses that browser's language settings instead.

## When to use it

<!-- scene: language-chooser-order -->

Use this stage whenever your protocol has more than one language and you can't be sure that a participant's device is set to the language they want to use. Until the participant chooses, the interview is shown in the first of their browser's languages that your protocol has. If your protocol has none of them, the interview is shown in your default language.

> Do: Put the Language Chooser at the very start of your protocol, before any screen with text that participants need to understand.

> Avoid: Adding a Language Chooser to a protocol that has only one language. Participants will see a single language to choose, which adds a step without giving them a choice.

> Avoid: Relying on the participant's device to pick the right language when it matters for your study. Devices shared between people, or set up by someone else, may be set to a language the participant doesn't read.

## Write the heading

<!-- section: Customize built-in wording -->
<!-- field: title -->

The **Heading** is shown above the list of languages. A new Language Chooser starts with the heading _Choose a language_. Your protocol gets this heading in each of its languages, if Network Canvas has wording in that language. You can change the heading. The participant reads it in the language the interview is shown in, so the heading changes as soon as they choose.

When the **Customize built-in wording** section is switched off, the stage uses Network Canvas's wording. The section starts switched on when your protocol has more than one language, so you can check the heading in each language. If Network Canvas has no wording in your default language, the section can't be switched off. The protocol can't be downloaded until you write the heading in that language.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

## See where the languages come from

<!-- section: Languages -->
<!-- scene: language-chooser-languages -->

Participants choose from every language your protocol is written in. You choose these languages when you create the protocol, and they belong to the whole protocol. This section shows the same list as the **Languages** page in the project navigation. A change made in either place applies to the whole protocol.

The interview sorts the languages alphabetically by their own names, so the order here makes no difference to participants.

> Do: Translate every text of your protocol into each of its languages before you start collecting data. A **Missing translations** badge marks each language that some texts aren't translated into yet, and the translation table on the **Languages** page shows what is still missing.

Read more about [managing your protocol's languages](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#managing-your-protocols-languages).

## Choose the default language

<!-- section: Languages -->
<!-- field: default-language -->

Once your protocol has more than one language, choose its **Default language** here. Participants see the default language wherever text has no translation in the language they use. The interview also starts in the default language if the participant's browser doesn't prefer any of your protocol's languages.

Read more about [the default language](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#the-default-language-and-which-translation-participants-see).

## Add a language

<!-- section: Languages -->

Click **Add languages** to offer participants another language. Your own text has no translation in the new language yet. Wording that Network Canvas supplies, such as this stage's heading, is filled in for the new language if Network Canvas has wording in that language and you haven't changed that wording in your default language.

## Choose languages to add

<!-- dialog: =add languages -->
<!-- field: languages -->

Search for each language by its name, its name in its own language, or its code. Choose as many languages as you need.

You might choose a regional variant of a language that Network Canvas has wording in, such as Mexican Spanish. Architect then asks whether to add the main language too, such as Spanish. Participants using the variant then see Network Canvas's wording wherever you haven't written your own.

## Remove or relabel a language

<!-- section: Languages -->

The delete button at the end of a language's row removes that language and deletes its translations. Architect asks you to confirm first. You can't delete the default language. You also can't delete a language that holds the only translation of some text, including text on this stage that isn't saved yet. Point to the delete button to see why it is unavailable.

If text was recorded under the wrong language, use the button with two arrows. It records that language's translations as a different language. Nothing is translated or deleted.

Read more about [removing a language](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#removing-a-language).

## Choose the right language

<!-- dialog: to a different language -->
<!-- field: language -->

Choose the language the text is really written in. For example, text in a protocol upgraded from an older version may be recorded under the wrong language. Every translation recorded under the old language moves to the language you choose. If the old language was the default language, the language you choose becomes the default.

<!-- include: skip-logic -->

<!-- include: rule -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
