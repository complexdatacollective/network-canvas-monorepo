import { useAppIntl } from '@codaco/app-i18n/react';
import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';

import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  NODE_CONFIGURATION_PATHS,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/**
 * The attributes of the person node type the interface records about every
 * family member: their name, gender identity and sex assigned at birth (asked
 * in the side panel), and the marker it sets on the participant.
 *
 * The researcher binds each slot. The name is collected from the participant
 * with the attribute's own validation (a VALIDATED writer); the other three
 * are written by the interface itself (UNVALIDATED), so none of them may be an
 * attribute a validated control collects, here or elsewhere in the protocol.
 * Gender identity and sex assigned at birth use value sets the interface owns;
 * the participant marker is exclusive to its slot.
 */
export default function NodeConfigurationSection() {
  const intl = useAppIntl();
  const {
    personSubject,
    draftSlotMap,
    validatedPersonVariables,
    unvalidatedPersonVariables,
  } = usePedigreeDraftBindings();
  const waiting = personSubject === null;

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
            name={NODE_CONFIGURATION_PATHS.nameVariable}
            label={messages.nameLabel}
            hint={messages.nameHint}
            createLabel={messages.nameCreateLabel}
            subject={personSubject}
            variableType="text"
            writerClass="validated"
            draftConflicting={unvalidatedPersonVariables}
            draftSlotMap={draftSlotMap}
            offerValidation
          />
          <SlotVariableField
            name={NODE_CONFIGURATION_PATHS.genderIdentityVariable}
            label={messages.genderIdentityLabel}
            hint={messages.genderIdentityHint}
            createLabel={messages.genderIdentityCreateLabel}
            subject={personSubject}
            variableType="categorical"
            writerClass="unvalidated"
            ownedOptions="pedigreeGenderIdentity"
            draftConflicting={validatedPersonVariables}
            draftSlotMap={draftSlotMap}
          />
          <SlotVariableField
            name={NODE_CONFIGURATION_PATHS.sexAssignedAtBirthVariable}
            label={messages.sexAssignedAtBirthLabel}
            hint={messages.sexAssignedAtBirthHint}
            createLabel={messages.sexAssignedAtBirthCreateLabel}
            subject={personSubject}
            variableType="categorical"
            writerClass="unvalidated"
            ownedOptions="pedigreeSexAssignedAtBirth"
            draftConflicting={validatedPersonVariables}
            draftSlotMap={draftSlotMap}
          />
          <SlotVariableField
            name={NODE_CONFIGURATION_PATHS.egoVariable}
            label={messages.egoLabel}
            hint={messages.egoHint}
            createLabel={messages.egoCreateLabel}
            subject={personSubject}
            variableType="boolean"
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.egoVariable}
            draftConflicting={validatedPersonVariables}
            draftSlotMap={draftSlotMap}
          />
        </>
      )}
    </BuilderSection>
  );
}
