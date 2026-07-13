import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import ItemEditor from './ItemEditor';
import ItemPreview from './ItemPreview';
import { denormalizeType, normalizeType } from './itemTypes';
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

const ContentGrid = (_props: StageEditorSectionProps) => (
  <Section
    title="Items"
    summary={
      <Paragraph>
        Add text, image, video, and audio blocks below, and drag them to
        reorder. Participants can scroll through the screen, so add as many
        blocks as you need. Image and video blocks can be given a display size.
      </Paragraph>
    }
  >
    <Row>
      <ValidatedFieldArray
        name="items"
        label="Content items"
        labelHidden
        component={DialogArrayField}
        validation={{ notEmpty }}
        componentProps={{
          addTitle: 'Edit Item',
          editorFieldsComponent: ItemEditor,
          editorProps: { allowSize: true },
          editorTitle: 'Edit Item',
          emptyStateMessage:
            'No items have been created yet. Click "Create new" to add text or media.',
          itemLabel: 'item',
          itemSelector: denormalizeType,
          normalizeItem: normalizeType,
          previewComponent: ItemPreview,
          requestedEditFormName: 'editable-list-form',
          sortable: true,
        }}
      />
    </Row>
  </Section>
);
export default ContentGrid;
