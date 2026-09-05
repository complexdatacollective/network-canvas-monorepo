import type { StageType } from '@codaco/protocol-validation';

import type { DialogArrayItemSelector } from '../../form/arrayFields/DialogArrayField.tsx';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';

/**
 * The editor slot each kind of block keeps its draft in.
 *
 * A saved block has ONE `content` key whose meaning depends on its `type`:
 * prose for a text block, a resource id for every other kind. Edited through a
 * single control, changing the kind has to destroy the value — and until it
 * does, the incoming kind's control is showing the outgoing kind's value: a
 * resource id sitting in a rich text editor, one save away from becoming what
 * a participant reads.
 *
 * So each kind gets a slot of its own. Only the chosen kind's control is
 * mounted; the rest are parked in the dialog's store, so switching back and
 * forth loses nothing and no value reaches a control that cannot mean it. Four
 * slots rather than two, because an image id is not a valid audio or video id
 * either.
 *
 * Flat names rather than `content.text` paths: the row merge writes each
 * dormant entry with a lodash-style `set`, which reads a dot as a path and
 * would replace the committed `content` STRING with an object.
 */
export const CONTENT_BLOCK_SLOTS = Object.freeze({
  text: 'contentText',
  image: 'contentImage',
  audio: 'contentAudio',
  video: 'contentVideo',
});

/** A kind of block that has a content control of its own. */
export type ContentBlockKind = keyof typeof CONTENT_BLOCK_SLOTS;

export const isContentBlockKind = (value: unknown): value is ContentBlockKind =>
  typeof value === 'string' && Object.hasOwn(CONTENT_BLOCK_SLOTS, value);

/**
 * What a researcher may put on a page, in the order they are offered.
 *
 * Whole labels rather than a capitalised `type`, because these are the words a
 * translation would carry — and a test pins the announcements below to them,
 * so the two cannot drift.
 */
export const CONTENT_BLOCK_KIND_OPTIONS: {
  value: ContentBlockKind;
  label: string;
}[] = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Text' },
];

/**
 * The display sizes an asset block may be constrained to.
 *
 * The empty value is the unconstrained one: the schema spells "no constraint"
 * by the key being absent, and a radio group needs something for the
 * researcher to choose in order to say so.
 */
export const CONTENT_BLOCK_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Full size' },
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
];

/** The sizes the schema accepts, so nothing else can ever be written. */
const VALID_SIZES: ReadonlySet<string> = new Set(['SMALL', 'MEDIUM', 'LARGE']);

/** Size is a visual treatment, so the two kinds with no visual box have none. */
const sizeableKind = (kind: unknown): boolean =>
  kind === 'image' || kind === 'video' || kind === 'asset';

/**
 * Whether a page's asset blocks carry a display size at all.
 *
 * A fact about the schema rather than a choice a caller makes: `size` exists
 * on the Information stage's own items and nowhere else — a pedigree's
 * introduction blocks are a strict object without it, so offering the control
 * there would author a stage the protocol refuses. Read from the stage being
 * edited because a row editor is handed the row and nothing else; everything
 * about its surroundings reaches it through the editor's context, exactly as
 * the shared sections do. That is what lets the same block editor be mounted
 * unchanged by a page and by a task's introduction screen.
 */
const SIZEABLE_PAGE_STAGES: ReadonlySet<StageType> = new Set(['Information']);

export const pageBlocksCarrySize = (stageType: StageType): boolean =>
  SIZEABLE_PAGE_STAGES.has(stageType);

const isRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The concrete kind of a saved block, resolved against the asset manifest.
 *
 * The schema stores only `text` or `asset`, because what an asset IS belongs
 * to the manifest rather than to the page. The editor works the other way
 * round — it has to know whether to offer an image picker or an audio one —
 * so the manifest is consulted here and the saved discriminant is restored by
 * `collapseContentBlock`.
 *
 * `undefined` for a reference nothing in the manifest answers, and for one
 * naming a resource a page cannot present (a roster, a map layer, an API key).
 * Those are different problems for the researcher, which is why the editor is
 * left to say which rather than being handed a kind that would be a guess.
 */
export function contentBlockKind(
  context: ProtocolBuilderProtocolContext,
  item: Record<string, unknown>,
): ContentBlockKind | undefined {
  if (item.type === 'text') return 'text';
  const reference = asString(item.content) ?? '';
  const kind = context.assets[reference]?.type;
  return isContentBlockKind(kind) ? kind : undefined;
}

/**
 * Opens a saved block on the controls its own kind names.
 *
 * The row keeps its saved `content` untouched: the slot is what the editor
 * writes, and `collapseContentBlock` is what decides which slot becomes
 * `content` again. A block whose reference cannot be resolved keeps its saved
 * `asset` type, gets no slot, and so gets no content control at all — which is
 * what stops a resource id being offered as prose.
 */
export const expandContentBlock: DialogArrayItemSelector = (
  context,
  { item },
) => {
  const kind = contentBlockKind(context, item);
  if (kind === undefined) return item;
  return { ...item, type: kind, [CONTENT_BLOCK_SLOTS[kind]]: item.content };
};

/**
 * Collapses an edited block back into what the schema stores.
 *
 * Every slot is editor state, and both saved block schemas are strict objects,
 * so a surviving slot key does not merely take up space — it makes the
 * protocol invalid. They are stripped by the slot list rather than by the
 * chosen kind, so a draft the researcher typed and then switched away from
 * cannot ride along.
 *
 * A block that never went through the editor has no slot at all, and its
 * `content` stands: this also runs over rows the list normalises without
 * opening them.
 */
export function collapseContentBlock(value: unknown): unknown {
  if (!isRow(value)) return value;

  const { size, ...rest } = value;
  const collapsed: Record<string, unknown> = {
    ...rest,
    type: value.type === 'text' ? 'text' : 'asset',
  };
  for (const slot of Object.values(CONTENT_BLOCK_SLOTS)) {
    delete collapsed[slot];
  }

  // The chosen kind's slot is the only authority on `content`. The row still
  // carries what it was opened with, so promoting the slot — rather than
  // leaving that value in place — is what stops a resource id being saved as
  // the text a participant reads. A slot present but empty clears `content`.
  const slot = isContentBlockKind(value.type)
    ? CONTENT_BLOCK_SLOTS[value.type]
    : undefined;
  if (slot !== undefined && Object.hasOwn(value, slot)) {
    const draft = value[slot];
    if (typeof draft === 'string') collapsed.content = draft;
    else delete collapsed.content;
  }

  if (!sizeableKind(value.type) || typeof size !== 'string') return collapsed;
  return VALID_SIZES.has(size) ? { ...collapsed, size } : collapsed;
}

/**
 * What the block editor's live region says when a kind is chosen or changed.
 *
 * Choosing a kind mounts a whole new required control, and changing one
 * replaces the control outright — a rich text editor becomes a resource
 * picker, or the other way round. A sighted researcher sees both happen;
 * without an announcement they are silent, and silence about a change that
 * would otherwise destroy work is the worst possible reading of it.
 *
 * Each case is a whole sentence chosen by branch rather than assembled from
 * fragments, so it can be localised as a unit, and each says only what is true
 * of the draft: nothing is described as kept unless something was entered.
 */
export type ContentDraftOutcome = 'restored' | 'kept' | 'empty';

const kindLabel = (kind: ContentBlockKind): string =>
  CONTENT_BLOCK_KIND_OPTIONS.find((option) => option.value === kind)?.label ??
  kind;

export const contentKindChosenAnnouncement = (kind: ContentBlockKind): string =>
  `Content type set to ${kindLabel(kind)}. A content field for it has been added below.`;

export const contentKindChangedAnnouncement = (
  kind: ContentBlockKind,
  outcome: ContentDraftOutcome,
): string => {
  const label = kindLabel(kind);
  if (outcome === 'restored') {
    return `Content type changed to ${label}. The content you entered for ${label} earlier has been restored.`;
  }
  if (outcome === 'kept') {
    return `Content type changed to ${label}. The content you entered for the previous type is kept, and returns if you change back to it.`;
  }
  return `Content type changed to ${label}. Nothing has been entered for ${label} yet.`;
};
