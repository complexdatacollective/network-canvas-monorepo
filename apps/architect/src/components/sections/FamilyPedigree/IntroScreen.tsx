import type { ComponentType } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import type { FamilyPedigreeIntroItem } from '@codaco/protocol-validation';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import { arrayValidationMessages } from '~/components/Form/arrayFields/arrayMessages';
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
const remainingMessages = defineMessages({
  editSection: {
    id: 'architect.remaining.sections.familyPedigree.introScreen.editSection',
    defaultMessage: 'Edit Section',
    description:
      'The addTitle text in components / sections / FamilyPedigree / IntroScreen.',
  },
});
const additionalMessages = defineMessages({
  createNewContentSection: {
    id: 'architect.additional.sections.familyPedigree.introScreen.createNewContentSection',
    defaultMessage: 'Create new content section',
    description:
      'The addButtonLabel text in components / sections / FamilyPedigree / IntroScreen.',
  },
  noContentSectionsHaveBeenCreated: {
    id: 'architect.additional.sections.familyPedigree.introScreen.noContentSectionsHaveBeenCreated',
    defaultMessage:
      'No content sections have been created yet. Click "Create new content section" to add text or media to the intro screen.',
    description:
      'The emptyStateMessage text in components / sections / FamilyPedigree / IntroScreen.',
  },
});
const messages = defineMessages({
  introductoryScreen: {
    id: 'architect.sections.familyPedigree.introScreen.introductoryScreen',
    defaultMessage: 'Introductory screen',
    description:
      'The title text in components / sections / FamilyPedigree / IntroScreen.',
  },
  optionallyShowParticipantsTextOrMedia: {
    id: 'architect.sections.familyPedigree.introScreen.optionallyShowParticipantsTextOrMedia',
    defaultMessage:
      'Optionally show participants text or media before the family pedigree task begins.',
    description:
      'The description text in components / sections / FamilyPedigree / IntroScreen.',
  },
  contentSections: {
    id: 'architect.sections.familyPedigree.introScreen.contentSections',
    defaultMessage: 'Content sections',
    description:
      'The label text in components / sections / FamilyPedigree / IntroScreen.',
  },
  contentSection: {
    id: 'architect.sections.familyPedigree.introScreen.contentSection',
    defaultMessage: 'content section',
    description:
      'The itemLabel text in components / sections / FamilyPedigree / IntroScreen.',
  },
});

// `ItemPreview`'s default export is a react-redux `connect()`ed component
// (ContentGrid batch), so its prop type is too specific to satisfy the array
// field's generic `Renderer` bag; DialogArrayField always spreads the row's
// own properties into it, so the cast is safe.
type Renderer = ComponentType<Record<string, unknown>>;

const IntroScreen = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const items = useStageFormValue<FamilyPedigreeIntroItem[] | undefined>(
    'introScreen.items',
  );
  const initialItems =
    useStageInitialValue<FamilyPedigreeIntroItem[]>('introScreen.items');
  const isEnabled = items !== undefined;

  return (
    <Section
      title={intl.formatMessage(messages.introductoryScreen)}
      description={intl.formatMessage(
        messages.optionallyShowParticipantsTextOrMedia,
      )}
      toggleable
      defaultOpen={isEnabled}
    >
      <ArchitectArrayField
        name="introScreen.items"
        label={intl.formatMessage(messages.contentSections)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(
          additionalMessages.createNewContentSection,
        )}
        validation={{
          required: createMessageError(arrayValidationMessages.required),
        }}
        initialValue={initialItems ?? []}
        addTitle={intl.formatMessage(remainingMessages.editSection)}
        previewComponent={ItemPreview as unknown as Renderer}
        editorFieldsComponent={ItemEditor}
        editorDialogSize="workspace"
        editorTitle={intl.formatMessage(remainingMessages.editSection)}
        itemLabelMessage={messages.contentSection}
        sortable
        normalizeItem={normalizeType as unknown as (value: unknown) => unknown}
        itemSelector={denormalizeType as unknown as DialogArrayItemSelector}
        requestedEditFormName="editable-list-form"
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noContentSectionsHaveBeenCreated,
        )}
      />
    </Section>
  );
};
export default IntroScreen;
