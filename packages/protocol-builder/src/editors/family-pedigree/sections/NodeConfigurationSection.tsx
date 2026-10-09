import { get } from 'es-toolkit/compat';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { asLocalizedString } from '../../../localization/localizedText.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import GenderIdentitySection from './GenderIdentitySection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  NAME_FIELD_PATHS,
  NODE_CONFIGURATION_PATHS,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';
import { startingWording, useSuppliedPedigreeText } from './pedigreeWording.ts';
import PersonSymbolsControl from './PersonSymbolsControl.tsx';
import RelationshipToParticipantSection from './RelationshipToParticipantSection.tsx';

/**
 * The attributes of the person node type the interface records about every
 * family member: their name and sex assigned at birth (asked in the side
 * panel), and the marker it sets on the participant. Gender identity, which is
 * optional, is a subsection after them (`GenderIdentitySection`).
 *
 * The researcher binds each slot. The name is collected from the participant
 * with the attribute's own validation (a VALIDATED writer); the other two are
 * written by the interface itself (UNVALIDATED), so none of them may be an
 * attribute a validated control collects, here or elsewhere in the protocol.
 * Sex assigned at birth uses a value set the interface owns, and the
 * participant marker is exclusive to its slot: no other control of this stage,
 * a nomination prompt included, may write it.
 *
 * The person type's symbols (`PersonSymbolsControl`) follow, one choice that
 * can draw them from sex assigned at birth or gender identity, so it comes
 * after both. The section ends with the optional relationship to the
 * participant (`RelationshipToParticipantSection`), which the interface works
 * out rather than asks.
 */
export default function NodeConfigurationSection() {
  const intl = useAppIntl();
  const {
    personSubject,
    draftSlotMap,
    draftWriterMap,
    validatedPersonVariables,
    unvalidatedPersonVariables,
    otherAnswerVariables,
  } = usePedigreeDraftBindings();
  const waiting = personSubject === null;
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedPedigreeText();
  const hasNameQuestion =
    get(committedFields, NAME_FIELD_PATHS.prompt) !== undefined;

  return (
    <BuilderSection
      title={intl.formatMessage(messages.nodeConfigurationTitle)}
      description={intl.formatMessage(
        waiting
          ? messages.nodeConfigurationWaiting
          : messages.nodeConfigurationDescription,
      )}
      disabled={waiting}
    >
      {!waiting && (
        <>
          <SlotVariableField
            name={NODE_CONFIGURATION_PATHS.nameAttribute}
            label={messages.nameLabel}
            hint={messages.nameHint}
            createLabel={messages.nameCreateLabel}
            subject={personSubject}
            variableType="text"
            writerClass="validated"
            draftConflicting={unvalidatedPersonVariables}
            draftBoundElsewhere={otherAnswerVariables.name}
            draftSlotMap={draftSlotMap}
            offerValidation
          />
          {supplied !== undefined && (
            <>
              <Field<typeof LocalizedInputField>
                name={NAME_FIELD_PATHS.prompt}
                component={LocalizedInputField}
                label={intl.formatMessage(messages.namePromptLabel)}
                hint={intl.formatMessage(messages.namePromptHint)}
                initialValue={startingWording(
                  committedFields,
                  NAME_FIELD_PATHS.prompt,
                  supplied,
                )}
                required={REQUIRED}
              />
              <Field<typeof LocalizedInputField>
                name={NAME_FIELD_PATHS.hint}
                component={LocalizedInputField}
                label={intl.formatMessage(messages.nameHintTextLabel)}
                hint={intl.formatMessage(messages.nameHintTextHint)}
                // A stage holding the question without guidance had it
                // removed, so the supplied guidance is not put back.
                initialValue={
                  hasNameQuestion
                    ? asLocalizedString(
                        get(committedFields, NAME_FIELD_PATHS.hint),
                      )
                    : supplied.get(NAME_FIELD_PATHS.hint)
                }
              />
            </>
          )}
          <SlotVariableField
            name={NODE_CONFIGURATION_PATHS.sexAssignedAtBirthAttribute}
            label={messages.sexAssignedAtBirthLabel}
            hint={messages.sexAssignedAtBirthHint}
            createLabel={messages.sexAssignedAtBirthCreateLabel}
            subject={personSubject}
            variableType="categorical"
            writerClass="unvalidated"
            ownedOptions="pedigreeSexAssignedAtBirth"
            draftConflicting={validatedPersonVariables}
            draftBoundElsewhere={otherAnswerVariables.sexAssignedAtBirth}
            draftSlotMap={draftSlotMap}
          />
          <SlotVariableField
            name={NODE_CONFIGURATION_PATHS.egoAttribute}
            label={messages.egoLabel}
            hint={messages.egoHint}
            createLabel={messages.egoCreateLabel}
            subject={personSubject}
            variableType="boolean"
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.egoAttribute}
            draftConflicting={validatedPersonVariables}
            draftSlotMap={draftWriterMap}
          />
          <GenderIdentitySection />
          {personSubject.entity === 'node' && (
            <PersonSymbolsControl personSubject={personSubject} />
          )}
          <RelationshipToParticipantSection />
        </>
      )}
    </BuilderSection>
  );
}
