<!--
  Walkthrough for the "Information" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Information.md).
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

# Information

## What an information stage is

<!-- scene: information-intro -->

The Information stage is a screen you can use to communicate with the participant during the interview. It can be used to explain forthcoming tasks or to give information.

It supports text, images, video and audio in the order you set.

Read the full [Information documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/information).

> Do: Use it to explain stage activities to participants to increase comprehension and engagement. This may be especially important for increasing survey accessibility.

> Avoid: Overloading the page with text. Instead, consider using other resource types to communicate information to your participants.

## Write the page heading

<!-- section: page-content -->
<!-- field: title -->

The **Page heading** is required, and is shown large and centered at the top of the page.

## Build the page

<!-- section: page-content -->
<!-- field: items -->
<!-- scene: information-blocks -->

Each item is one block of the page: text, an image, a video or audio. Items appear from top to bottom in the order listed here, and you can drag them to reorder them. A page needs at least one item, and you can add as many as you need. Participants scroll if the page is longer than the screen.

Audio and video start playing as soon as the page opens, and video starts muted and loops. Give each image, video and audio item a **Description**, which a screen reader reads in place of it.

> Do: Consider using piped text to customize what is shown to the participant to communicate more effectively.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
