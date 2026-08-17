import { useCallback, type ComponentType } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FamilyPedigreeIntroItem } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
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
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

// `ItemPreview`'s default export is a react-redux `connect()`ed component
// (ContentGrid batch), so its prop type is too specific to satisfy the array
// field's generic `Renderer` bag; DialogArrayField always spreads the row's
// own properties into it, so the cast is safe.
type Renderer = ComponentType<Record<string, unknown>>;

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

const IntroScreen = (_props: StageEditorSectionProps) => {
  const setStageValue = useSetStageValue();
  // The registered LEAF is `introScreen.items` — `introScreen` itself is
  // never a field, so writing to it (as the old `{items: []} | null` whole-
  // object toggle did) would silently no-op against the array field's own
  // dormant/registered slot. `undefined` is the disabled sentinel — fresco-ui's
  // `ArrayField` only special-cases `undefined` (a default-parameter fallback
  // to its own empty array), so a field that is still mounted for one more
  // render when this writes (the toggle handler runs before the Section's own
  // `isOpen` flips) must never see `null`: `useArrayFieldItems` calls
  // `value.forEach` unconditionally and only `undefined` is defaulted away.
  const items = useStageFormValue<FamilyPedigreeIntroItem[] | undefined>(
    'introScreen.items',
  );
  const initialItems =
    useStageInitialValue<FamilyPedigreeIntroItem[]>('introScreen.items');
  const isEnabled = items !== undefined;

  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      // Turning on always starts from an empty list (never resurrects a
      // previous session's items); turning off parks the disabled sentinel
      // so a later re-open starts fresh too, and so this section's own
      // `startExpanded` read doesn't fall back to a stale committed value.
      setStageValue('introScreen.items', newState ? [] : undefined);
      return true;
    },
    [setStageValue],
  );

  return (
    <Section
      title="Intro Screen"
      summary={
        <Paragraph>
          Optionally show an introductory screen to participants before the
          family pedigree task begins. Add text and media sections below, and
          drag them to reorder.
        </Paragraph>
      }
      toggleable
      startExpanded={isEnabled}
      handleToggleChange={handleToggleChange}
    >
      <>
        <ArchitectArrayField
          name="introScreen.items"
          label="Content sections"
          component={DialogArrayField}
          addButtonLabel="Create new content section"
          validation={{ notEmpty }}
          initialValue={initialItems ?? []}
          addTitle="Edit Section"
          previewComponent={ItemPreview as unknown as Renderer}
          editorFieldsComponent={ItemEditor}
          editorTitle="Edit Section"
          itemLabel="content section"
          sortable
          normalizeItem={
            normalizeType as unknown as (value: unknown) => unknown
          }
          itemSelector={denormalizeType as unknown as DialogArrayItemSelector}
          requestedEditFormName="editable-list-form"
          emptyStateMessage='No content sections have been created yet. Click "Create new content section" to add text or media to the intro screen.'
        />
      </>
    </Section>
  );
};
export default IntroScreen;
