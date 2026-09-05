import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { withoutAbsentValues } from '../form/absentValues.ts';
import DialogArrayField from '../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection from './BuilderSection.tsx';
import {
  type RowEditorComponent,
  type RowPreviewComponent,
  useRowRenderers,
} from './rowRenderers.tsx';

const TITLE_FIELD = 'title';
const ITEMS_FIELD = 'items';

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
}>;

const DEFAULT_COPY: PageContentCopy = {
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
};

export type PageContentSectionProps = Readonly<{
  /**
   * The family's own block fields, rendered inside the row dialog.
   *
   * What a block CAN be — text, an image, a video — is the interface's
   * business, and choosing a media file needs a resource picker this section
   * knows nothing about. What every page has in common is a heading and an
   * ordered list of blocks, and that is all this section owns.
   */
  ItemEditor: RowEditorComponent;
  /** How one block reads in the list when its dialog is closed. */
  ItemPreview: RowPreviewComponent;
  copy?: Partial<PageContentCopy>;
}>;

/**
 * A page of content the participant reads, rather than a task they do.
 *
 * Deliberately not the same section as the task introduction, which the two
 * were nearly merged into: an introduction is one heading and one passage of
 * prose held inside `introductionPanel`, while a page is a heading and an
 * ordered list of blocks held at the stage's own `title` and `items`. Merging
 * them would have meant one section owning two different sets of paths and
 * choosing between them from a prop.
 */
export default function PageContentSection({
  ItemEditor,
  ItemPreview,
  copy,
}: PageContentSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    ItemEditor,
    ItemPreview,
  );

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof InputField>
        name={TITLE_FIELD}
        component={InputField}
        label={words.titleLabel}
        hint={words.titleHint}
        placeholder={words.titlePlaceholder}
        required
      />
      <ProtocolArrayField<typeof DialogArrayField>
        name={ITEMS_FIELD}
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
        normalizeItem={withoutAbsentValues}
        sortable
        {...itemsValidation}
      />
    </BuilderSection>
  );
}
