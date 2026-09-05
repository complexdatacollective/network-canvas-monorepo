import Field from '@codaco/fresco-ui/form/Field/Field';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import RichTextField from '../../../fields/RichTextField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../sections/rowRenderers.tsx';

/**
 * THE SEAM. A pedigree's introduction screen holds the same content blocks the
 * Information stage does — text and media — and the row editor for one belongs
 * to that family rather than to this one: choosing a media file needs the
 * resource picker, and what a block CAN be is the Information interface's
 * business. That editor is being built on the forms/Information branch, under
 * `src/editors/forms/contentBlocks/`, and will be lifted to the shared branch.
 *
 * Until it lands, this composes `PageContentSection`'s `introScreen` variant
 * with text blocks only, so a researcher can write and reorder the prose the
 * pedigree opens with rather than having a key on screen that nothing edits.
 * Swapping it is a two-line change in `FamilyPedigreeStageEditor`: import the
 * shared block editor and preview, and drop this directory.
 *
 * The one thing it must not do meanwhile is damage a block it cannot edit, so
 * a media block is shown and left exactly as the protocol holds it.
 */
const CONTENT_FIELD = 'content';

/** The block kind this seam can edit. The schema's other kind is `asset`. */
const TEXT_BLOCK = 'text';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const isTextBlock = (item: Readonly<Record<string, unknown>>): boolean =>
  item.type === undefined || item.type === TEXT_BLOCK;

const MEDIA_BLOCK_NOTICE =
  'This block shows a picture or a video. Choosing media needs the resource browser, which this pedigree editor does not have yet, so the block is kept exactly as it is. Everything else about the introduction screen can be changed here.';

/**
 * What a block the researcher is adding becomes.
 *
 * The list field gives a new row nothing but an id, and the schema's blocks are
 * strict discriminated unions — so a row saved without a `type` is a block the
 * protocol refuses. An existing block keeps the kind it already has, which is
 * what stops a media block opened in this editor from being saved as prose.
 */
export function normalizeIntroScreenBlock(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const type = asString(value.type);
  return { ...value, type: type ?? TEXT_BLOCK };
}

/** One block of the introduction screen: prose the participant reads. */
export function IntroScreenBlockEditor({ item }: RowEditorProps) {
  if (!isTextBlock(item)) {
    return <Paragraph margin="none">{MEDIA_BLOCK_NOTICE}</Paragraph>;
  }

  return (
    <Field
      name={CONTENT_FIELD}
      component={RichTextField}
      label="Block text"
      hint="What the participant reads in this part of the introduction."
      placeholder="Enter the text of this block..."
      initialValue={asString(item.content)}
      required="Write the text this block shows."
    />
  );
}

/** How one block reads in the list when its dialog is closed. */
export function IntroScreenBlockPreview({ item }: RowPreviewProps) {
  if (!isTextBlock(item)) {
    return <Paragraph margin="none">{MEDIA_BLOCK_NOTICE}</Paragraph>;
  }

  return (
    <RenderMarkdown>{asString(item.content) ?? 'Empty block'}</RenderMarkdown>
  );
}
