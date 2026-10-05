import { useMemo } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { StageType } from '@codaco/protocol-validation';

import { withoutAbsentValues } from '../../form/absentValues.ts';
import { REQUIRED } from '../../form/requiredField.ts';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowTemplate,
  type RowEditorComponent,
  type RowListConfig,
  type RowPreviewComponent,
  type RowValues,
} from '../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import BuilderSection from '../BuilderSection.tsx';

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
    defaultMessage:
      'Use the page heading to show a large title element on your information stage.',
    description: 'Guidance under the page-heading field.',
  },
  headingPlaceholder: {
    id: 'protocolBuilder.pageContent.headingPlaceholder',
    defaultMessage: 'Enter your title here...',
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
      'Set the page heading and build the sequence of text and media blocks participants will see.',
    description: 'Description of the page-content section.',
  },
  pageItemsLabel: {
    id: 'protocolBuilder.pageContent.pageItemsLabel',
    defaultMessage: 'Items',
    description:
      'Label of the ordered list of pieces a page is built from — passages of text, pictures, videos.',
  },
  pageItemsHint: {
    id: 'protocolBuilder.pageContent.pageItemsHint',
    defaultMessage:
      'Add text, image, video, and audio blocks below, and drag them to reorder. Participants can scroll through the screen, so add as many blocks as you need. Image and video blocks can be given a display size.',
    description: 'Guidance under the list of blocks on a page.',
  },
  pageAddLabel: {
    id: 'protocolBuilder.pageContent.pageAddLabel',
    defaultMessage: 'Create new content item',
    description:
      'Button that opens the dialog for adding one more piece to a page. Whole rather than a generic "Add", because a stage editor shows several lists at once.',
  },
  pageAddTitle: {
    id: 'protocolBuilder.pageContent.pageAddTitle',
    defaultMessage: 'Create item',
    description:
      'Title of the dialog a researcher fills in to add one more piece to a page.',
  },
  pageEditTitle: {
    id: 'protocolBuilder.pageContent.pageEditTitle',
    defaultMessage: 'Edit item',
    description:
      'Title of the dialog a researcher fills in to change a piece of a page.',
  },
  pageItemNoun: {
    id: 'protocolBuilder.pageContent.pageItemNoun',
    defaultMessage: 'item',
    description:
      'What one piece of a page is called inside things said ABOUT it — "Edit item", "Delete this item?" — so it is lower case and singular.',
  },
  pageEmptyState: {
    id: 'protocolBuilder.pageContent.pageEmptyState',
    defaultMessage:
      'No items have been created yet. Click "Create new content item" to add text or media.',
    description:
      'Shown in place of the list of blocks while a page holds nothing yet.',
  },
});

const AT_LEAST_ONE_ITEM = createMessageError(messages.atLeastOne);

const TITLE_FIELD = 'title';
const ITEMS_FIELD = 'items';

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
  /**
   * What the item's own dialog says under its title.
   *
   * The family's, because what an item may be is the family's: the dialog says
   * it once, above the fields, instead of a group inside it restating the
   * title it was opened under.
   */
  itemDescription?: MessageDescriptor;
  /** How one block reads in the list when its dialog is closed. */
  ItemPreview: RowPreviewComponent;
  /**
   * The private shape a family's block editor works on, and how it is removed
   * again.
   *
   * A block's `content` is one key whose MEANING depends on its `type`: prose
   * for a text block, a resource id for every other kind. Edited through a
   * single control, changing the type has to destroy the value — and until it
   * does, the incoming type's control is showing the outgoing type's value, an
   * image id sitting in a rich text editor one save away from becoming what a
   * participant reads. So a family gives each type a slot of its own,
   * `expand`s `content` into the slot its type names, and `collapse`s the
   * active slot back into `content` on the way out.
   *
   * ONE prop rather than two, because they are two halves of one contract and
   * the second half is the one the saved protocol depends on: every per-type
   * slot is editor state, and both saved block schemas are strict, so a slot
   * left on the row does not merely take up space — it makes the protocol
   * invalid. A family that could declare `expand` alone would compile, send
   * the host an editor-only key, and hold the researcher at the save with an
   * error naming a key that is nowhere in the schema and nowhere on their
   * screen. Requiring both is what makes that unwritable.
   *
   * `collapse` is composed with, not substituted for, this section's own rule
   * that an unanswered value is spelled by the key not being there.
   */
  slots?: Readonly<{
    expand: (
      context: ProtocolBuilderProtocolContext,
      row: RowValues,
    ) => RowValues;
    /**
     * Takes the stage the page is on as well as the row, because what a saved
     * block may carry depends on the stage's schema (an Information stage's
     * items hold a display size). A family reading that from the row alone
     * could restore a key the page has no room for.
     */
    collapse: (value: unknown, stageType: StageType) => unknown;
  }>;
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
 * The stage IS the page: its heading and its blocks are the stage's own
 * `title` and `items`, and there is nothing to switch off.
 */
export default function PageContentSection({
  ItemEditor,
  itemDescription,
  ItemPreview,
  slots,
}: PageContentSectionProps) {
  const intl = useAppIntl();
  const { identity } = useStageEditorForm();
  // Read here rather than inside the block editor, because opening a saved
  // block on the right controls is a question about the asset manifest and the
  // editor is handed the row already answered.
  const protocolContext = useProtocolContext();
  // The family's collapse runs FIRST: it decides what `content` becomes, and
  // an emptied slot has to be able to clear it. Stripping absent values first
  // would hide the empty slot from the collapse and leave the old content
  // standing.
  const collapse = slots?.collapse;
  const expand = slots?.expand;
  const stageType = identity.type;
  const rowList = useMemo<RowListConfig>(
    () => ({
      Preview: ItemPreview,
      Editor: ItemEditor,
      addTitle: messages.pageAddTitle,
      editTitle: messages.pageEditTitle,
      ...(itemDescription === undefined
        ? {}
        : { description: itemDescription }),
      formId: 'content-block-editor',
      name: ITEMS_FIELD,
      ...(expand === undefined
        ? {}
        : { expand: (row: RowValues) => expand(protocolContext, row) }),
      normalize: (row) =>
        withoutAbsentValues(
          collapse === undefined ? row : collapse(row, stageType),
        ) as RowValues,
    }),
    [
      ItemEditor,
      ItemPreview,
      itemDescription,
      collapse,
      expand,
      protocolContext,
      stageType,
    ],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.pageTitle)}
      description={intl.formatMessage(messages.pageDescription)}
    >
      <Field<typeof InputField>
        name={TITLE_FIELD}
        component={InputField}
        label={intl.formatMessage(messages.headingLabel)}
        hint={intl.formatMessage(messages.headingHint)}
        placeholder={intl.formatMessage(messages.headingPlaceholder)}
        required={REQUIRED}
      />
      <RowList config={rowList}>
        <Field<typeof ArrayField<RowValues>>
          name={ITEMS_FIELD}
          label={intl.formatMessage(messages.pageItemsLabel)}
          hint={intl.formatMessage(messages.pageItemsHint)}
          component={ArrayField}
          getId={rowId}
          addButtonLabel={intl.formatMessage(messages.pageAddLabel)}
          itemLabel={messages.pageItemNoun}
          emptyStateMessage={intl.formatMessage(messages.pageEmptyState)}
          itemComponent={RowListItem}
          editorComponent={RowDialog}
          itemTemplate={rowTemplate()}
          sortable
          required={AT_LEAST_ONE_ITEM}
        />
      </RowList>
    </BuilderSection>
  );
}
