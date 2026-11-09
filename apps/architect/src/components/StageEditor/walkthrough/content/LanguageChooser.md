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

The Language Chooser is a screen where the participant chooses the language for the rest of the interview, from the languages your protocol is written in. It shows a heading above a list of those languages, each written in its own language, with the language the interview is in already selected.

Choosing another language switches the interview to it at once, this screen included, along with every screen after it. The participant can change their mind before moving on, and can move on without choosing anything.

Read the full [Language Chooser documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/language-chooser).

## What data it collects

<!-- scene: language-chooser-data -->

None. It creates no nodes or edges, and the participant's choice is not saved with the interview or included in your exported data.

The choice is kept in the browser tab running the interview, so it lasts if the page reloads. An interview resumed in another tab or on another device starts again from that browser's language settings.

## When to use it

<!-- scene: language-chooser-order -->

Use it whenever your protocol has more than one language and you can't be sure that a participant's device is set to the language they want to use. Until a participant chooses, the interview is shown in the first of their browser's languages that your protocol has, or else in your default language.

> Do: Put the Language Chooser at the very start of your protocol, before any screen with text that participants need to understand.

> Avoid: Adding a Language Chooser to a protocol that has only one language. Participants will see a single language to choose, which adds a step without giving them a choice.

> Avoid: Relying on the participant's device to pick the right language when it matters for your study. Devices shared between people, or set up by someone else, may be set to a language the participant doesn't read.

## Write the heading

<!-- section: Customize built-in wording -->
<!-- field: title -->

The **Heading** is shown above the list of languages. A new Language Chooser starts with _Choose a language_, written in each of your protocol's languages that Network Canvas has wording for, and you can change it. The participant reads it in the language the interview is shown in, so it changes as soon as they choose.

Switched off, the stage uses Network Canvas's wording. The section starts switched on when your protocol has more than one language, so you can check the heading in each one. If your default language is one Network Canvas has no wording in, the section is always shown, and the protocol can't be downloaded until you write the heading in that language.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

## See where the languages come from

<!-- section: Languages -->
<!-- scene: language-chooser-languages -->

Participants choose from every language your protocol is written in. You choose them when you create the protocol, and they belong to the whole protocol, so this section is the same list as the **Languages** page in the project navigation. A change made in either place applies to the whole protocol.

The interview lists the languages alphabetically by the names it shows, each in its own language, so the order here makes no difference to participants.

> Do: Translate every text of your protocol into each of its languages before you start collecting data. A **Missing translations** badge marks each language that some texts aren't translated into yet, and the translation table on the **Languages** page shows what is still missing.

Read more about [managing your protocol's languages](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#managing-your-protocols-languages).

## Choose the default language

<!-- section: Languages -->
<!-- field: default-language -->

Once your protocol has more than one language, choose its **Default language** here. Participants see it wherever there is no translation in a language they use, and the interview starts in it when their browser asks for none of your protocol's languages.

Read more about [the default language](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#the-default-language-and-which-translation-participants-see).

## Add a language

<!-- section: Languages -->

Click **Add languages** to offer participants another language. Your own text starts with no translation in it, while wording Network Canvas supplies, such as this stage's heading, is added in the new language if Network Canvas has it and you haven't changed it in your default language.

## Choose languages to add

<!-- dialog: =add languages -->
<!-- field: languages -->

Search for each language by its name, its name in its own language or its code, and choose as many as you need.

If you choose a regional variant of a language Network Canvas has wording in, such as Mexican Spanish, Architect asks whether to add that language too, so participants using the variant see Network Canvas's wording wherever you haven't written your own.

## Remove or relabel a language

<!-- section: Languages -->

The delete button at the end of a language's row removes it, after asking, and deletes its translations. It is unavailable for the default language, and for a language holding the only translation of some text, including this stage's unsaved text. Point to it to see why.

The button with two arrows records a language's translations as a different language, for text recorded under the wrong one. Nothing is translated or deleted.

Read more about [removing a language](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#removing-a-language).

## Choose the right language

<!-- dialog: to a different language -->
<!-- field: language -->

Choose the language the text is really written in, for example in a protocol upgraded from an older version. Every translation recorded under the old language, and the default language if it was that one, moves to the language you choose.

<!-- include: skip-logic -->

<!-- include: rule -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
