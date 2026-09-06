import { useMemo } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

const messages = defineMessages({
  atLeastOne: {
    id: 'protocolBuilder.pageContent.atLeastOne',
    defaultMessage:
      'Add at least one block. A page with no content shows the participant nothing.',
    description:
      'Refusal shown above the list of blocks when a researcher saves a page that shows nothing. A block is one piece of a page — a passage of text, a picture, a video.',
  },
  headingLabel: {
    id: 'protocolBuilder.pageContent.headingLabel',
    defaultMessage: 'Page heading',
    description:
      'Label of the field holding the large heading at the top of a page a participant reads.',
  },
  headingHint: {
    id: 'protocolBuilder.pageContent.headingHint',
    defaultMessage: 'The large heading shown at the top of the page.',
    description: 'Guidance under the page-heading field.',
  },
  headingPlaceholder: {
    id: 'protocolBuilder.pageContent.headingPlaceholder',
    defaultMessage: 'Enter a heading...',
    description:
      'Placeholder shown in the empty page-heading field. The trailing dots are an ellipsis written as three full stops.',
  },
  pageTitle: {
    id: 'protocolBuilder.pageContent.pageTitle',
    defaultMessage: 'Page content',
    description:
      'Heading of the section where a researcher builds a page of text and media that a participant reads instead of doing a task.',
  },
  pageDescription: {
    id: 'protocolBuilder.pageContent.pageDescription',
    defaultMessage:
      'Write the page heading and build the sequence of blocks the participant reads.',
    description: 'Description of the page-content section.',
  },
  pageItemsLabel: {
    id: 'protocolBuilder.pageContent.pageItemsLabel',
    defaultMessage: 'Content blocks',
    description:
      'Label of the ordered list of pieces a page is built from — passages of text, pictures, videos.',
  },
  pageItemsHint: {
    id: 'protocolBuilder.pageContent.pageItemsHint',
    defaultMessage:
      'The participant scrolls through these in order, so add as many as you need. Drag to reorder them.',
    description: 'Guidance under the list of blocks on a page.',
  },
  pageAddLabel: {
    id: 'protocolBuilder.pageContent.pageAddLabel',
    defaultMessage: 'Create new content block',
    description:
      'Button that opens the dialog for adding one more piece to a page. Whole rather than a generic "Add", because a stage editor shows several lists at once.',
  },
  pageAddTitle: {
    id: 'protocolBuilder.pageContent.pageAddTitle',
    defaultMessage: 'Create content block',
    description:
      'Title of the dialog a researcher fills in to add one more piece to a page.',
  },
  pageEditTitle: {
    id: 'protocolBuilder.pageContent.pageEditTitle',
    defaultMessage: 'Edit content block',
    description:
      'Title of the dialog a researcher fills in to change a piece of a page.',
  },
  pageItemNoun: {
    id: 'protocolBuilder.pageContent.pageItemNoun',
    defaultMessage: 'block',
    description:
      'What one piece of a page is called inside things said ABOUT it — "Edit block", "Remove this block?" — so it is lower case and singular.',
  },
  pageEmptyState: {
    id: 'protocolBuilder.pageContent.pageEmptyState',
    defaultMessage:
      'No blocks yet. Create one to put text or media on this page.',
    description:
      'Shown in place of the list of blocks while a page holds nothing yet.',
  },
  pageClearTitle: {
    id: 'protocolBuilder.pageContent.pageClearTitle',
    defaultMessage: 'This will clear the page',
    description:
      'Title of the confirmation asked before switching a page off, which throws every block on it away.',
  },
  pageClearDescription: {
    id: 'protocolBuilder.pageContent.pageClearDescription',
    defaultMessage:
      'This will remove every block on this page. Do you want to continue?',
    description:
      'Body of the confirmation asked before switching a page off, which throws every block on it away.',
  },
  pageClearConfirm: {
    id: 'protocolBuilder.pageContent.pageClearConfirm',
    defaultMessage: 'Clear the page',
    description:
      'Action that confirms switching a page off and discarding its blocks.',
  },
  introTitle: {
    id: 'protocolBuilder.pageContent.introTitle',
    defaultMessage: 'Introduction screen',
    description:
      'Heading of the section where a researcher builds a page of text and media shown before this step of the interview’s own task begins.',
  },
  introDescription: {
    id: 'protocolBuilder.pageContent.introDescription',
    defaultMessage:
      'Show the participant a screen of text and media before this task begins.',
    description: 'Description of the introduction-screen section.',
  },
  introItemsLabel: {
    id: 'protocolBuilder.pageContent.introItemsLabel',
    defaultMessage: 'Introduction blocks',
    description:
      'Label of the ordered list of pieces the introduction screen is built from.',
  },
  introItemsHint: {
    id: 'protocolBuilder.pageContent.introItemsHint',
    defaultMessage:
      'The participant scrolls through these in order before starting the task. Drag to reorder them.',
    description: 'Guidance under the list of blocks on an introduction screen.',
  },
  introAddLabel: {
    id: 'protocolBuilder.pageContent.introAddLabel',
    defaultMessage: 'Create new introduction block',
    description:
      'Button that opens the dialog for adding one more piece to an introduction screen.',
  },
  introAddTitle: {
    id: 'protocolBuilder.pageContent.introAddTitle',
    defaultMessage: 'Create introduction block',
    description:
      'Title of the dialog a researcher fills in to add one more piece to an introduction screen.',
  },
  introEditTitle: {
    id: 'protocolBuilder.pageContent.introEditTitle',
    defaultMessage: 'Edit introduction block',
    description:
      'Title of the dialog a researcher fills in to change a piece of an introduction screen.',
  },
  introItemNoun: {
    id: 'protocolBuilder.pageContent.introItemNoun',
    defaultMessage: 'introduction block',
    description:
      'What one piece of an introduction screen is called inside things said ABOUT it — "Edit introduction block" — so it is lower case and singular.',
  },
  introEmptyState: {
    id: 'protocolBuilder.pageContent.introEmptyState',
    defaultMessage:
      'No blocks yet. Create one to explain this task before the participant starts it.',
    description:
      'Shown in place of the list of blocks while an introduction screen holds nothing yet.',
  },
  introClearTitle: {
    id: 'protocolBuilder.pageContent.introClearTitle',
    defaultMessage: 'This will remove the introduction screen',
    description:
      'Title of the confirmation asked before switching the introduction screen off, which throws every block on it away.',
  },
  introClearDescription: {
    id: 'protocolBuilder.pageContent.introClearDescription',
    defaultMessage:
      'This will delete every block on the introduction screen, and the participant will start the task straight away. Do you want to continue?',
    description:
      'Body of the confirmation asked before switching the introduction screen off, which throws every block on it away.',
  },
  introClearConfirm: {
    id: 'protocolBuilder.pageContent.introClearConfirm',
    defaultMessage: 'Remove the introduction screen',
    description:
      'Action that confirms switching the introduction screen off and discarding its blocks.',
  },
});

const AT_LEAST_ONE_ITEM = createMessageError(messages.atLeastOne);

const itemsValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      Array.isArray(value) && value.length > 0 ? undefined : AT_LEAST_ONE_ITEM,
  ]),
};

/**
 * The words each variant uses, per variant rather than per key.
 *
 * A page and a task's introduction screen are the same control and different
 * things: one IS the step of the interview, the other precedes the task the
 * step does. Whole sentences per variant rather than a noun swapped into a
 * shared frame, because the two read differently in any language that inflects
 * around the noun.
 */
const WORDS: Readonly<
  Record<
    PageContentVariant,
    Readonly<{
      title: MessageDescriptor;
      description: MessageDescriptor;
      itemsLabel: MessageDescriptor;
      itemsHint: MessageDescriptor;
      addLabel: MessageDescriptor;
      addTitle: MessageDescriptor;
      editTitle: MessageDescriptor;
      itemNoun: MessageDescriptor;
      emptyState: MessageDescriptor;
      clearTitle: MessageDescriptor;
      clearDescription: MessageDescriptor;
      clearConfirm: MessageDescriptor;
    }>
  >
> = Object.freeze({
  page: Object.freeze({
    title: messages.pageTitle,
    description: messages.pageDescription,
    itemsLabel: messages.pageItemsLabel,
    itemsHint: messages.pageItemsHint,
    addLabel: messages.pageAddLabel,
    addTitle: messages.pageAddTitle,
    editTitle: messages.pageEditTitle,
    itemNoun: messages.pageItemNoun,
    emptyState: messages.pageEmptyState,
    clearTitle: messages.pageClearTitle,
    clearDescription: messages.pageClearDescription,
    clearConfirm: messages.pageClearConfirm,
  }),
  introScreen: Object.freeze({
    title: messages.introTitle,
    description: messages.introDescription,
    itemsLabel: messages.introItemsLabel,
    itemsHint: messages.introItemsHint,
    addLabel: messages.introAddLabel,
    addTitle: messages.introAddTitle,
    editTitle: messages.introEditTitle,
    itemNoun: messages.introItemNoun,
    emptyState: messages.introEmptyState,
    clearTitle: messages.introClearTitle,
    clearDescription: messages.introClearDescription,
    clearConfirm: messages.introClearConfirm,
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
}: PageContentSectionProps) {
  const intl = useAppIntl();
  const words = WORDS[variant];
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
              title: words.clearTitle,
              description: words.clearDescription,
              confirmLabel: words.clearConfirm,
            },
          },
    [
      placement.capabilityField,
      words.clearConfirm,
      words.clearDescription,
      words.clearTitle,
    ],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(words.title)}
      description={intl.formatMessage(words.description)}
      {...(capability === undefined ? {} : { capability })}
    >
      {placement.titleField !== undefined && (
        <ProtocolField<typeof InputField>
          name={placement.titleField}
          component={InputField}
          label={intl.formatMessage(messages.headingLabel)}
          hint={intl.formatMessage(messages.headingHint)}
          placeholder={intl.formatMessage(messages.headingPlaceholder)}
          required
        />
      )}
      <ProtocolArrayField<typeof DialogArrayField>
        name={placement.itemsField}
        label={intl.formatMessage(words.itemsLabel)}
        hint={intl.formatMessage(words.itemsHint)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(words.addLabel)}
        addTitle={intl.formatMessage(words.addTitle)}
        editorTitle={intl.formatMessage(words.editTitle)}
        itemLabel={words.itemNoun}
        emptyStateMessage={intl.formatMessage(words.emptyState)}
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
