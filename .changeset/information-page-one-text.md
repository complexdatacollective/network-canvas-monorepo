---
'@codaco/shared-consts': minor
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': major
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/development-protocol': patch
'@codaco/sample-protocol': patch
---

An Information stage's page is now one text. Its page heading, text, images,
audio and video, which were a title and a list of separate items, are written
together in a single editor in Architect, in the order participants read them.
The page heading is a heading at the top of the text. An image, audio recording
or video is added from the editor's toolbar (Insert image, Insert audio, Insert
video) and sits in the text as a block, which can be dragged to another place.
Selecting a block opens its settings beside it: a description for participants
who cannot see or hear it, a display size for images and videos, where it sits
across the page, and, for audio and video, whether it starts playing
automatically and whether it repeats when it ends. Both are on unless you turn
them off. An image or video can also be resized by dragging the handle at its
corner, which takes it to the nearest of the display sizes. The editor grows
with the page, so all of it stays in view.

Each language of a protocol has its own text, so a page can show a different
file in each language. The translation table shows each file as a line naming
it and keeps it in place while you edit the words around it, and the printable
summary lists each file where it sits in the page, with its settings.

The rich text editor's toolbar is regrouped: undo and redo, the style of the
line (one list offering Paragraph and each heading, in place of a button for
each heading), bold and italic, lists, then what inserts something into the
text (a link, a thematic break, an emoji), what inserts a file, and what
inserts a placeholder. Where the editor is too narrow for it, it wraps onto
another line a button at a time, instead of hiding its last buttons.

Upgrading a protocol from schema 8 joins each Information stage's page heading
and items into one text, in the order they were shown, so participants see the
same page. Where items joined as they are would read differently (two numbered
lists one after the other, which would number straight through as one list, or
links in two items that share a label), the page's text is written again in a
form that reads the same and keeps them apart. An audio recording keeps playing once, at the start of its line, as
it did before. A page heading that held only spaces is left out, as is an item
whose file is no longer among the protocol's resources; a page that would then
be empty shows the name of its stage as its heading. A note written on a block
of text, which participants never saw, is not kept. The migration notes
describe this in English; the other languages follow.

Three fixes to how typed text is stored as markdown, in every rich text field:
a run of `#` before a space (`Section ## 2`) keeps all its signs, where it was
cut to one; tildes that would strike words through in an interview (`~~old~~`)
are shown as typed, as they are in the editor; and a numbered list item keeps
what is written under its first line (a list inside it, a second paragraph),
where saving the text again used to move it out of the item or run it into the
line above. Two lists in a row stay two lists.

For developers: the schema 9 Information stage is `{ content }`, a localized
markdown string declared with `assetBlocks: true`, in place of `title` and
`items`, and the `Item` type is gone. A file is written as a markdown image in
a paragraph of its own whose address names an asset:
`![description](asset:<assetId>?size=small|medium|large&align=start|end&autoplay=false&loop=false)`.
`@codaco/shared-consts` exports what a block can be (`ASSET_BLOCK_KINDS`,
`ASSET_BLOCK_SIZES`, `ASSET_BLOCK_ALIGNMENTS`, `ASSET_BLOCK_DEFAULTS`, their
guards and the `AssetBlockAttributes` type).
`@codaco/protocol-validation` exports the grammar (`assetBlockMarkdown`,
`readAssetBlockUrl`, `assetBlocksInMessage` and others) and how a block is
shown (`assetBlockFile`, `assetBlockSettings`, `assetBlockAlignmentShows`), reports a block whose
asset is missing or is not an image, audio or video, or that is written where
none can be shown (inside a heading, a link, struck-through words, a table
cell, a `select` or `plural` version, or with a dynamic value in its
description or address), reading the text in the markdown the interview shows
it in (CommonMark with GitHub's additions), and counts each block as
an asset reference. `RichTextEditor` takes `assetBlocks` (a block view and an
optional picker); `@codaco/fresco-ui` adds `assetBlockLayout` (the classes a
block is drawn with), `SegmentedSwitcherField` and `testing/assetBlock`, and
`Popover` passes on `collisionAvoidance`, `collisionPadding` and
`collisionBoundary`; and `RenderMarkdown` takes `blockImages`, which draws
matching markdown images with a component of the caller's and never draws one
from raw HTML. `@codaco/protocol-validation` exports `informationPageContent`,
which joins a page drawn as parts (a heading, text, files) into its one text
exactly as the 8 to 9 migration does, and `./testing/information-pages`, the
pages its tests check that against. `SyntheticInterview` builds Information
stages in the new shape through it: `addInformationStage`'s title, text and
blocks are joined as a migrated page's title and items are.
