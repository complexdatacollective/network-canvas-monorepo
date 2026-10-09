import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  type MessageArguments,
  PEDIGREE_WORDING_ARGUMENTS,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageValidation,
} from '../../../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  PARTICIPANT_WORDING_GROUPS,
  type WordingGate,
} from './participantWordingSettings.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import { NODE_CONFIGURATION_PATHS } from './pedigreeSlots.ts';
import { startingWording, useSuppliedPedigreeText } from './pedigreeWording.ts';

/**
 * Every setting the participant sees on this stage, in the words the
 * Family Pedigree's own interface uses, with the wording Network Canvas
 * supplies for each in the protocol's languages.
 *
 * Each setting starts as the stage holds it, or as Network Canvas supplies it
 * when the stage is new, so it waits for the protocol's languages.
 */
export default function ParticipantWordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedPedigreeText();
  const framing = useStageValue('framing');
  const genderIdentity = useStageValue(NODE_CONFIGURATION_PATHS.genderIdentity);
  const shown: Readonly<Record<WordingGate, boolean>> = {
    choosesFraming: framing === 'participantPreference',
    asksGenderIdentity: genderIdentity !== undefined,
  };

  const validations = useMemo(
    () =>
      new Map<MessageArguments, CustomFieldValidation>(
        Object.values(PEDIGREE_WORDING_ARGUMENTS).map((declaration) => [
          declaration,
          localizedMessageValidation(declaration, intl),
        ]),
      ),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.wordingTitle)}
      description={intl.formatMessage(messages.wordingDescription)}
    >
      {supplied !== undefined &&
        PARTICIPANT_WORDING_GROUPS.map((group) => (
          <BuilderSection
            key={group.title.id}
            title={intl.formatMessage(group.title)}
          >
            {group.settings
              .filter(
                (setting) => setting.gate === undefined || shown[setting.gate],
              )
              .map((setting) => {
                const name = `wording.${setting.key}`;
                const label = intl.formatMessage(setting.label);
                const hint =
                  setting.hint === undefined
                    ? undefined
                    : intl.formatMessage(setting.hint);
                const initialValue = startingWording(
                  committedFields,
                  name,
                  supplied,
                );
                return setting.arguments === undefined ? (
                  <Field<typeof LocalizedInputField>
                    key={name}
                    name={name}
                    component={LocalizedInputField}
                    label={label}
                    hint={hint}
                    initialValue={initialValue}
                    required={REQUIRED}
                  />
                ) : (
                  <Field<typeof LocalizedMessageField>
                    key={name}
                    name={name}
                    component={LocalizedMessageField}
                    label={label}
                    hint={hint}
                    arguments={setting.arguments}
                    initialValue={initialValue}
                    required={REQUIRED}
                    custom={validations.get(setting.arguments)}
                  />
                );
              })}
          </BuilderSection>
        ))}
    </BuilderSection>
  );
}
