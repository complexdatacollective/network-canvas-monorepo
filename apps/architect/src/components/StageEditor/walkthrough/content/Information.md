<!--
  Walkthrough for the "Information" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Information.md).
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

# Information

## What an information stage is

<!-- scene: information-intro -->

The Information stage is a page the participant reads before moving on. It shows a heading, followed by blocks of text, images, video and audio in the order you set. It asks no questions and does not create nodes or edges.

Read the full [Information documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/information).

## What data it collects

<!-- scene: information-data -->

This stage collects no data. Nothing the participant does here, such as reading the page or playing its media, is added to your exported data.

## When to use it

Use this stage to introduce your study, or to explain the task on the stage that follows it, such as before a [Dyad Census](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/dyad-census).

> Do: Use it to explain stage activities to participants to increase comprehension and engagement. This may be especially important for increasing survey accessibility.

> Avoid: Overloading the page with text. Instead, consider using other resource types to communicate information to your participants.

## Write the page heading

<!-- section: Page content -->
<!-- field: title -->

The **Page heading** is required, and is shown large and centered at the top of the page. To insert one of the participant's ego attributes or today's date, use the syringe button in the toolbar.

## Build the page

<!-- section: Page content -->
<!-- field: items -->
<!-- scene: information-blocks -->

Each item is one block of the page: text, an image, a video or audio. Items appear from top to bottom in the order listed here, and you can drag them to reorder them. A page needs at least one item, and you can add as many as you need. Participants scroll if the page is longer than the screen.

To tour the item window, click **Create new content item** or open an existing item.

## Choose the content type

<!-- dialog: create item | edit item -->
<!-- field: type -->

Choose **Image**, **Video**, **Audio** or **Text**. If you switch to another type while the window is open, Architect keeps what you entered for the previous type and brings it back if you switch back. Only the content for the type you end on is saved.

## Write the text

<!-- dialog: create item | edit item -->
<!-- field: contentText -->

For a text item, the **Content** is what the participant reads. The toolbar adds bold, italics, headings, lists, links and dividing lines. As in the page heading, the syringe button inserts an ego attribute or today's date.

## Choose the file

<!-- dialog: create item | edit item -->
<!-- scene: information-media -->

For an image, video or audio item, the **Content** is a file stored in the protocol. You import or choose the file in a separate window. Audio and video start playing as soon as the page opens, and the participant can pause and replay them with the media controls. Video starts muted and loops.

Read more about [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

## Describe the media

<!-- dialog: create item | edit item -->
<!-- field: description -->

The **Description** is read aloud to a participant using a screen reader, in place of the image or the file's name. Leave it empty for an image that is only decoration.

## Choose the display size

<!-- dialog: create item | edit item -->
<!-- field: size -->
<!-- scene: information-size -->

Images and videos have a **Display size**. **Full size** shows them at their natural height. **Small**, **Medium** and **Large** limit their height, and they keep their proportions as they shrink.

## Import or reuse a file

<!-- dialog: choose an image | choose a video | choose an audio file -->

Import a file from your computer, or choose one already stored in this protocol. Images can be JPG, GIF, PNG or SVG files. Videos can be MP4 or MOV files, and audio can be MP3, M4A or AIFF files.

Read more about [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

<!-- include: skip-logic -->

<!-- include: rule -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
