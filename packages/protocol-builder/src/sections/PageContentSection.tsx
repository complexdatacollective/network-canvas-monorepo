import { useMemo } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { withoutAbsentValues } from '../form/absentValues.ts';
import type { DialogArrayItemSelector } from '../form/arrayFields/DialogArrayField.tsx';
import DialogArrayField from '../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import {
  type RowEditorComponent,
  type RowPreviewComponent,
  useRowRenderers,
} from './rowRenderers.tsx';

/**
 * What a page of content IS to the stage around it.
 *
 * Not a pair of paths a caller passes in. Where the blocks live, whether there
 * is a heading above them, and whether the whole thing can be switched off are
 * three answers to one question — is this stage a page, or does a page precede
 * the task it does — and letting a family answer them separately would let it
 * ask for combinations the schema has no room for.
 *
 * - `page`: the stage IS the page. Its heading and its blocks are the stage's
 *   own `title` and `items`, the heading is required, and there is nothing to
 *   switch off — a page with no content is not a stage.
 * - `introScreen`: a page shown BEFORE a task, at `introScreen.items`. No
 *   heading, because the task's own name is already above it, and switchable:
 *   a pedigree that opens straight into the task is an ordinary thing to want.
 */
export type PageContentVariant = 'page' | 'introScreen';

const AT_LEAST_ONE_ITEM =
  'Add at least one block. A page with no content shows the participant nothing.';

const itemsValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      Array.isArray(value) && value.length > 0 ? undefined : AT_LEAST_ONE_ITEM,
  ]),
};

export type PageContentCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /** The three below are rendered by the `page` variant only. */
  titleLabel: string;
  titleHint: string;
  titlePlaceholder: string;
  itemsLabel: string;
  itemsHint: string;
  /** Visible text and accessible name of the add button. */
  addButtonLabel: string;
  addTitle: string;
  editorTitle: string;
  /** Noun used in row affordances ("Edit block", "Remove block"). */
  itemLabel: string;
  emptyStateMessage: string;
  /** Asked before a switchable variant throws its blocks away. */
  confirmClearTitle: string;
  confirmClearDescription: string;
  confirmClearLabel: string;
}>;

const DEFAULT_COPY: Readonly<Record<PageContentVariant, PageContentCopy>> =
  Object.freeze({
    page: Object.freeze({
      sectionTitle: 'Page content',
      description:
        'Write the page heading and build the sequence of blocks the participant reads.',
      titleLabel: 'Page heading',
      titleHint: 'The large heading shown at the top of the page.',
      titlePlaceholder: 'Enter a heading...',
      itemsLabel: 'Content blocks',
      itemsHint:
        'The participant scrolls through these in order, so add as many as you need. Drag to reorder them.',
      addButtonLabel: 'Create new content block',
      addTitle: 'Create content block',
      editorTitle: 'Edit content block',
      itemLabel: 'block',
      emptyStateMessage:
        'No blocks yet. Create one to put text or media on this page.',
      confirmClearTitle: 'This will clear the page',
      confirmClearDescription:
        'This will remove every block on this page. Do you want to continue?',
      confirmClearLabel: 'Clear the page',
    }),
    introScreen: Object.freeze({
      sectionTitle: 'Introduction screen',
      description:
        'Show the participant a screen of text and media before this task begins.',
      titleLabel: 'Page heading',
      titleHint: 'The large heading shown at the top of the page.',
      titlePlaceholder: 'Enter a heading...',
      itemsLabel: 'Introduction blocks',
      itemsHint:
        'The participant scrolls through these in order before starting the task. Drag to reorder them.',
      addButtonLabel: 'Create new introduction block',
      addTitle: 'Create introduction block',
      editorTitle: 'Edit introduction block',
      itemLabel: 'introduction block',
      emptyStateMessage:
        'No blocks yet. Create one to explain this task before the participant starts it.',
      confirmClearTitle: 'This will remove the introduction screen',
      confirmClearDescription:
        'This will delete every block on the introduction screen, and the participant will start the task straight away. Do you want to continue?',
      confirmClearLabel: 'Remove the introduction screen',
    }),
  });

/** Where each variant's heading and blocks live in the stage document. */
const PLACEMENT: Readonly<
  Record<
    PageContentVariant,
    Readonly<{
      /** `undefined` for a page whose heading the stage already provides. */
      titleField?: string;
      itemsField: string;
      /** The path a switch clears, or `undefined` for a page that must exist. */
      capabilityField?: string;
    }>
  >
> = Object.freeze({
  page: Object.freeze({ titleField: 'title', itemsField: 'items' }),
  introScreen: Object.freeze({
    itemsField: 'introScreen.items',
    capabilityField: 'introScreen',
  }),
});

export type PageContentSectionProps = Readonly<{
  /**
   * The family's own block fields, rendered inside the row dialog.
   *
   * What a block CAN be — text, an image, a video — is the interface's
   * business, and choosing a media file needs a resource picker this section
   * knows nothing about. What every page has in common is an ordered list of
   * blocks, and that is all this section owns.
   */
  ItemEditor: RowEditorComponent;
  /** How one block reads in the list when its dialog is closed. */
  ItemPreview: RowPreviewComponent;
  variant?: PageContentVariant;
  /**
   * Expands a saved block into the richer object its editor works on.
   *
   * A block's `content` is one key whose MEANING depends on its `type`: prose
   * for a text block, a resource id for every other kind. Edited through a
   * single control, changing the type has to destroy the value — and until it
   * does, the incoming type's control is showing the outgoing type's value, an
   * image id sitting in a rich text editor one save away from becoming what a
   * participant reads. So a family gives each type a slot of its own and
   * expands `content` into the slot its type names here.
   */
  itemSelector?: DialogArrayItemSelector;
  /**
   * Collapses the edited block back into what the schema stores.
   *
   * The counterpart of `itemSelector`, and the half that matters to the saved
   * protocol: every per-type slot is editor state, and both saved block
   * schemas are strict, so a slot left on the row does not merely take up
   * space — it makes the protocol invalid. A family collapses the active slot
   * back into `content` and drops the rest here.
   *
   * Composed with, not instead of, this section's own rule that an unanswered
   * value is spelled by the key not being there.
   */
  normalizeItem?: (value: unknown) => unknown;
  copy?: Partial<PageContentCopy>;
}>;

/**
 * A page of content the participant reads, rather than a task they do.
 *
 * Deliberately not the same section as the task introduction, which the two
 * were nearly merged into: an introduction is one heading and one passage of
 * prose held inside `introductionPanel`, while a page is an ordered list of
 * blocks. Merging them would have meant one section owning two different sets
 * of paths and choosing between them from a prop.
 *
 * Where THIS section's own page lives is `variant`, which is a statement about
 * what the page is rather than a pair of paths: see `PageContentVariant`.
 */
export default function PageContentSection({
  ItemEditor,
  ItemPreview,
  variant = 'page',
  itemSelector,
  normalizeItem,
  copy,
}: PageContentSectionProps) {
  const words = { ...DEFAULT_COPY[variant], ...copy };
  const placement = PLACEMENT[variant];
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    ItemEditor,
    ItemPreview,
  );

  // The family's collapse runs FIRST: it decides what `content` becomes, and
  // an emptied slot has to be able to clear it. Stripping absent values first
  // would hide the empty slot from the collapse and leave the old content
  // standing.
  const normalize = useMemo(
    () =>
      normalizeItem === undefined
        ? withoutAbsentValues
        : (value: unknown) => withoutAbsentValues(normalizeItem(value)),
    [normalizeItem],
  );

  const capability = useMemo<SectionCapability | undefined>(
    () =>
      placement.capabilityField === undefined
        ? undefined
        : {
            fields: [placement.capabilityField],
            confirmClear: {
              title: words.confirmClearTitle,
              description: words.confirmClearDescription,
              confirmLabel: words.confirmClearLabel,
            },
          },
    [
      placement.capabilityField,
      words.confirmClearDescription,
      words.confirmClearLabel,
      words.confirmClearTitle,
    ],
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={words.description}
      {...(capability === undefined ? {} : { capability })}
    >
      {placement.titleField !== undefined && (
        <ProtocolField<typeof InputField>
          name={placement.titleField}
          component={InputField}
          label={words.titleLabel}
          hint={words.titleHint}
          placeholder={words.titlePlaceholder}
          required
        />
      )}
      <ProtocolArrayField<typeof DialogArrayField>
        name={placement.itemsField}
        label={words.itemsLabel}
        hint={words.itemsHint}
        component={DialogArrayField}
        addButtonLabel={words.addButtonLabel}
        addTitle={words.addTitle}
        editorTitle={words.editorTitle}
        itemLabel={words.itemLabel}
        emptyStateMessage={words.emptyStateMessage}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorDialogSize="editor"
        {...(itemSelector === undefined ? {} : { itemSelector })}
        normalizeItem={normalize}
        sortable
        {...itemsValidation}
      />
    </BuilderSection>
  );
}
