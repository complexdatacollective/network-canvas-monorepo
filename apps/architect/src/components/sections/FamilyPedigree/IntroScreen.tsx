import type { ComponentType } from 'react';

import Section from '@codaco/fresco-ui/Section';
import type { FamilyPedigreeIntroItem } from '@codaco/protocol-validation';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import type { DialogArrayItemSelector } from '~/components/Form/arrayFields/DialogArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import ItemEditor from '~/components/sections/ContentGrid/ItemEditor';
import ItemPreview from '~/components/sections/ContentGrid/ItemPreview';
import {
  denormalizeType,
  normalizeType,
} from '~/components/sections/ContentGrid/itemTypes';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

// `ItemPreview`'s default export is a react-redux `connect()`ed component
// (ContentGrid batch), so its prop type is too specific to satisfy the array
// field's generic `Renderer` bag; DialogArrayField always spreads the row's
// own properties into it, so the cast is safe.
type Renderer = ComponentType<Record<string, unknown>>;

const IntroScreen = (_props: StageEditorSectionProps) => {
  const items = useStageFormValue<FamilyPedigreeIntroItem[] | undefined>(
    'introScreen.items',
  );
  const initialItems =
    useStageInitialValue<FamilyPedigreeIntroItem[]>('introScreen.items');
  const isEnabled = items !== undefined;

  return (
    <Section
      title="Introductory screen"
      description="Optionally show participants text or media before the family pedigree task begins."
      toggleable
      defaultOpen={isEnabled}
    >
      <ArchitectArrayField
        name="introScreen.items"
        label="Content sections"
        component={DialogArrayField}
        addButtonLabel="Create new content section"
        validation={{ required: 'You must create at least one item.' }}
        initialValue={initialItems ?? []}
        addTitle="Edit Section"
        previewComponent={ItemPreview as unknown as Renderer}
        editorFieldsComponent={ItemEditor}
        editorDialogSize="workspace"
        editorTitle="Edit Section"
        itemLabel="content section"
        sortable
        normalizeItem={normalizeType as unknown as (value: unknown) => unknown}
        itemSelector={denormalizeType as unknown as DialogArrayItemSelector}
        requestedEditFormName="editable-list-form"
        emptyStateMessage='No content sections have been created yet. Click "Create new content section" to add text or media to the intro screen.'
      />
    </Section>
  );
};
export default IntroScreen;
