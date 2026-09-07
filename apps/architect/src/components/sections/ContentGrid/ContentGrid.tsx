import type { ComponentType } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

import ItemEditor from './ItemEditor';
import ItemPreview from './ItemPreview';
import { denormalizeType, normalizeType } from './itemTypes';
const remainingMessages = defineMessages({
  editItem: {
    id: 'architect.remaining.sections.contentGrid.contentGrid.editItem',
    defaultMessage: 'Edit Item',
    description:
      'The addTitle text in components / sections / ContentGrid / ContentGrid.',
  },
});
const additionalMessages = defineMessages({
  createNewContentItem: {
    id: 'architect.additional.sections.contentGrid.contentGrid.createNewContentItem',
    defaultMessage: 'Create new content item',
    description:
      'The addButtonLabel text in components / sections / ContentGrid / ContentGrid.',
  },
  noItemsHaveBeenCreatedYet: {
    id: 'architect.additional.sections.contentGrid.contentGrid.noItemsHaveBeenCreatedYet',
    defaultMessage:
      'No items have been created yet. Click "Create new content item" to add text or media.',
    description:
      'The emptyStateMessage text in components / sections / ContentGrid / ContentGrid.',
  },
});
const messages = defineMessages({
  pageContent: {
    id: 'architect.sections.contentGrid.contentGrid.pageContent',
    defaultMessage: 'Page content',
    description:
      'The title text in components / sections / ContentGrid / ContentGrid.',
  },
  setThePageHeadingAndBuild: {
    id: 'architect.sections.contentGrid.contentGrid.setThePageHeadingAndBuild',
    defaultMessage:
      'Set the page heading and build the sequence of text and media blocks participants will see.',
    description:
      'The description text in components / sections / ContentGrid / ContentGrid.',
  },
  pageHeading: {
    id: 'architect.sections.contentGrid.contentGrid.pageHeading',
    defaultMessage: 'Page heading',
    description:
      'The label text in components / sections / ContentGrid / ContentGrid.',
  },
  optionUseThePageHeadingToShow: {
    id: 'architect.sections.contentGrid.contentGrid.useThePageHeadingToShow',
    defaultMessage:
      'Use the page heading to show a large title element on your information stage.',
    description:
      'The hint text in components / sections / ContentGrid / ContentGrid.',
  },
  enterYourTitleHere: {
    id: 'architect.sections.contentGrid.contentGrid.enterYourTitleHere',
    defaultMessage: 'Enter your title here...',
    description:
      'The placeholder text in components / sections / ContentGrid / ContentGrid.',
  },
  items: {
    id: 'architect.sections.contentGrid.contentGrid.items',
    defaultMessage: 'Items',
    description:
      'The label text in components / sections / ContentGrid / ContentGrid.',
  },
  addTextImageVideoAndAudio: {
    id: 'architect.sections.contentGrid.contentGrid.addTextImageVideoAndAudio',
    defaultMessage:
      'Add text, image, video, and audio blocks below, and drag them to reorder. Participants can scroll through the screen, so add as many blocks as you need. Image and video blocks can be given a display size.',
    description:
      'The hint text in components / sections / ContentGrid / ContentGrid.',
  },
});

type Item = Record<string, unknown>;

const ContentGrid = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const initialTitle = useStageInitialValue<string>('title');
  const initialItems = useStageInitialValue<Item[]>('items');

  return (
    <Section
      title={intl.formatMessage(messages.pageContent)}
      description={intl.formatMessage(messages.setThePageHeadingAndBuild)}
    >
      <ArchitectField
        label={intl.formatMessage(messages.pageHeading)}
        hint={intl.formatMessage(messages.optionUseThePageHeadingToShow)}
        name="title"
        component={InputField}
        placeholder={intl.formatMessage(messages.enterYourTitleHere)}
        validation={{ required: true }}
        initialValue={initialTitle}
      />
      <ArchitectArrayField
        name="items"
        label={intl.formatMessage(messages.items)}
        hint={intl.formatMessage(messages.addTextImageVideoAndAudio)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(
          additionalMessages.createNewContentItem,
        )}
        validation={{
          required: createMessageError(arrayValidationMessages.required),
        }}
        initialValue={initialItems}
        addTitle={intl.formatMessage(remainingMessages.editItem)}
        editorFieldsComponent={
          ItemEditor as ComponentType<Record<string, unknown>>
        }
        editorDialogSize="editor"
        editorProps={{ allowSize: true }}
        editorTitle={intl.formatMessage(remainingMessages.editItem)}
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noItemsHaveBeenCreatedYet,
        )}
        itemLabelMessage={arrayItemMessages.item}
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
