import type { ComponentType } from 'react';

import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

import ItemEditor from './ItemEditor';
import ItemPreview from './ItemPreview';
import { denormalizeType, normalizeType } from './itemTypes';

type Item = Record<string, unknown>;

const ContentGrid = (_props: StageEditorSectionProps) => {
  const initialItems = useStageInitialValue<Item[]>('items');

  return (
    <Section
      title="Page content"
      description="Build the sequence of text and media blocks participants will see."
    >
      <ArchitectArrayField
        name="items"
        label="Items"
        hint="Add text, image, video, and audio blocks below, and drag them to reorder. Participants can scroll through the screen, so add as many blocks as you need. Image and video blocks can be given a display size."
        component={DialogArrayField}
        addButtonLabel="Create new content item"
        validation={{ required: 'You must create at least one item.' }}
        initialValue={initialItems}
        addTitle="Edit Item"
        editorFieldsComponent={
          ItemEditor as ComponentType<Record<string, unknown>>
        }
        editorDialogSize="editor"
        editorProps={{ allowSize: true }}
        editorTitle="Edit Item"
        emptyStateMessage='No items have been created yet. Click "Create new content item" to add text or media.'
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
    </Section>
  );
};
export default ContentGrid;
