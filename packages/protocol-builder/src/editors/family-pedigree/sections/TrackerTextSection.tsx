import { useMemo } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  type MessageArguments,
  PEDIGREE_PERSON_ARGUMENTS,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageValidation,
} from '../../../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import { TRACKER_TEXT_PATHS } from './pedigreeSlots.ts';

type MessageSetting = Readonly<{
  path: string;
  label: MessageDescriptor;
  hint: MessageDescriptor;
  arguments: MessageArguments;
}>;

/** The list's messages, in the order a participant meets them. */
const MESSAGE_SETTINGS: readonly MessageSetting[] = [
  {
    path: TRACKER_TEXT_PATHS.parentsItem,
    label: messages.trackerParentsLabel,
    hint: messages.trackerParentsHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
  {
    path: TRACKER_TEXT_PATHS.siblingsItem,
    label: messages.trackerSiblingsLabel,
    hint: messages.trackerSiblingsHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
  {
    path: TRACKER_TEXT_PATHS.siblingsNone,
    label: messages.trackerNoSiblingsLabel,
    hint: messages.trackerNoSiblingsHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
  {
    path: TRACKER_TEXT_PATHS.siblingsQuestion,
    label: messages.trackerSiblingsQuestionLabel,
    hint: messages.trackerSiblingsQuestionHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
  {
    path: TRACKER_TEXT_PATHS.childrenItem,
    label: messages.trackerChildrenLabel,
    hint: messages.trackerChildrenHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
  {
    path: TRACKER_TEXT_PATHS.childrenNone,
    label: messages.trackerNoChildrenLabel,
    hint: messages.trackerNoChildrenHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
  {
    path: TRACKER_TEXT_PATHS.childrenQuestion,
    label: messages.trackerChildrenQuestionLabel,
    hint: messages.trackerChildrenQuestionHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
  {
    path: TRACKER_TEXT_PATHS.detailsItem,
    label: messages.trackerDetailsLabel,
    hint: messages.trackerDetailsHint,
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  },
];

/**
 * The words of the list of what is still needed, and of the side panel's
 * questions about brothers, sisters and children: part of the completeness
 * requirement, and switched on and off with it.
 *
 * Each starts as the stage holds it, or as Network Canvas supplies it when
 * the requirement is new, so it waits for the protocol's languages.
 */
export default function TrackerTextSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording('FamilyPedigree');

  const validations = useMemo(
    () =>
      new Map<MessageArguments, CustomFieldValidation>(
        [PEDIGREE_PERSON_ARGUMENTS].map((declaration) => [
          declaration,
          localizedMessageValidation(declaration, intl),
        ]),
      ),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.trackerTextTitle)}
      description={intl.formatMessage(messages.trackerTextDescription)}
    >
      {supplied !== undefined && (
        <>
          {MESSAGE_SETTINGS.map((setting) => (
            <Field<typeof LocalizedMessageField>
              key={setting.path}
              name={setting.path}
              component={LocalizedMessageField}
              label={intl.formatMessage(setting.label)}
              hint={intl.formatMessage(setting.hint)}
              arguments={setting.arguments}
              initialValue={startingWording(
                committedFields,
                setting.path,
                supplied,
              )}
              required={REQUIRED}
              custom={validations.get(setting.arguments)}
            />
          ))}
          <Field<typeof LocalizedInputField>
            name={TRACKER_TEXT_PATHS.recommendedNote}
            component={LocalizedInputField}
            label={intl.formatMessage(messages.trackerRecommendedNoteLabel)}
            hint={intl.formatMessage(messages.trackerRecommendedNoteHint)}
            initialValue={startingWording(
              committedFields,
              TRACKER_TEXT_PATHS.recommendedNote,
              supplied,
            )}
            required={REQUIRED}
          />
        </>
      )}
    </BuilderSection>
  );
}
