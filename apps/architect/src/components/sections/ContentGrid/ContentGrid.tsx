import type { ComponentType } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

import ItemEditor from './ItemEditor';
import ItemPreview from './ItemPreview';
import { denormalizeType, normalizeType } from './itemTypes';

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

type Item = Record<string, unknown>;

const ContentGrid = (_props: StageEditorSectionProps) => {
  const initialItems = useStageInitialValue<Item[]>('items');

  return (
    <Section
      title="Items"
      summary={
        <Paragraph>
          Add text, image, video, and audio blocks below, and drag them to
          reorder. Participants can scroll through the screen, so add as many
          blocks as you need. Image and video blocks can be given a display
          size.
        </Paragraph>
      }
    >
      <Row>
        <ArchitectArrayField
          name="items"
          label="Content items"
          labelHidden
          component={DialogArrayField}
          validation={{ notEmpty }}
          initialValue={initialItems}
          addTitle="Edit Item"
          editorFieldsComponent={
            ItemEditor as ComponentType<Record<string, unknown>>
          }
          editorProps={{ allowSize: true }}
          editorTitle="Edit Item"
          emptyStateMessage='No items have been created yet. Click "Create new" to add text or media.'
          itemLabel="item"
          itemSelector={denormalizeType}
          normalizeItem={(value) =>
            normalizeType(value as Parameters<typeof normalizeType>[0])
          }
          previewComponent={
            ItemPreview as unknown as ComponentType<Record<string, unknown>>
          }
          requestedEditFormName="editable-list-form"
          sortable
        />
      </Row>
    </Section>
  );
};
export default ContentGrid;
