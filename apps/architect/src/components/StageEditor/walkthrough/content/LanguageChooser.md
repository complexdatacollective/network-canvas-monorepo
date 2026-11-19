<!--
  Walkthrough for the "Language Chooser" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (LanguageChooser.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images).
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

# Language Chooser

## What a Language Chooser is

<!-- scene: language-chooser-intro -->

The Language Chooser is a screen where the participant chooses the language for the rest of the interview. It shows a heading above a list of the languages your protocol is written in. Each language's name is written in that language, and the interview's current language is already selected.

When the participant chooses a language, this screen and every screen after it switch to that language straight away. The participant can change their mind before moving on, and can move on without choosing anything.

Read the full [Language Chooser documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/language-chooser).

## When to use it

<!-- scene: language-chooser-order -->

Use this stage whenever your protocol has more than one language and you can't be sure that a participant's device is set to the language they want to use. Until the participant chooses, the interview is shown in the first of their browser's languages that your protocol has. If your protocol has none of them, the interview is shown in your default language.

> Do: Put the Language Chooser at the very start of your protocol, before any screen with text that participants need to understand.

> Avoid: Adding a Language Chooser to a protocol that has only one language. Participants will see a single language to choose, which adds a step without giving them a choice.

> Avoid: Relying on the participant's device to pick the right language when it matters for your study. Devices shared between people, or set up by someone else, may be set to a language the participant doesn't read.

## Write the heading

<!-- section: built-in-wording -->
<!-- field: title -->

The **Heading** is shown above the list of languages. A new Language Chooser starts with the heading _Choose a language_, in each of your protocol's languages that Network Canvas has wording for. The participant reads the heading in the language the interview is currently shown in, so it changes as soon as they choose.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/design-protocols/translating-your-protocol#words-network-canvas-supplies).

## See where the languages come from

<!-- section: languages -->
<!-- scene: language-chooser-languages -->

The languages available are configured in Architect, and belong to the whole protocol. This section shows the same list as the **Languages** tab in the project navigation, and a change made in either place applies to the whole protocol.

The interview sorts the languages alphabetically by their own names, so the order here makes no difference to participants.

> Do: Translate every text of your protocol into each of its languages before you start collecting data. A **Missing translations** badge marks each language that some texts aren't translated into yet, and the translation table on the **Languages** page shows what is still missing.

Read more about [managing your protocol's languages](https://documentation.networkcanvas.com/design-protocols/translating-your-protocol#managing-your-protocols-languages).

## Choose the default language

<!-- section: languages -->
<!-- field: default-language -->

Once your protocol has more than one language, choose its **Default language** here. Participants see the default language wherever text has no translation in the language they use. The interview also starts in the default language if the participant's browser doesn't prefer any of your protocol's languages.

Read more about [the default language](https://documentation.networkcanvas.com/design-protocols/translating-your-protocol#the-default-language-and-which-translation-participants-see).

## Add a language

<!-- section: languages -->

Click **Add languages** to offer participants another language. Text you have written has no translation in the new language until you add one.

## Remove or relabel a language

<!-- section: languages -->

The delete button at the end of a language's row removes that language and deletes its translations. Architect asks you to confirm first. You can't delete the default language, or a language that holds the only translation of some text, including text on this stage that isn't saved yet. Point to the delete button to see why it is unavailable.

Read more about [removing a language](https://documentation.networkcanvas.com/design-protocols/translating-your-protocol#removing-a-language).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
