import { useAppIntl } from '@codaco/app-i18n/react';
import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';

import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import GenderIdentitySection from './GenderIdentitySection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  NODE_CONFIGURATION_PATHS,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/**
 * The attributes of the person node type the interface records about every
 * family member: their name and sex assigned at birth (asked in the side
 * panel), and the marker it sets on the participant. Gender identity, which is
 * optional, is a subsection between them (`GenderIdentitySection`).
 *
 * The researcher binds each slot. The name is collected from the participant
 * with the attribute's own validation (a VALIDATED writer); the other two are
 * written by the interface itself (UNVALIDATED), so none of them may be an
 * attribute a validated control collects, here or elsewhere in the protocol.
 * Sex assigned at birth uses a value set the interface owns, and the
 * participant marker is exclusive to its slot: no other control of this stage,
 * a nomination prompt included, may write it.
 */
export default function NodeConfigurationSection() {
  const intl = useAppIntl();
  const {
    personSubject,
    draftSlotMap,
    draftWriterMap,
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
            name={NODE_CONFIGURATION_PATHS.nameAttribute}
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
            name={NODE_CONFIGURATION_PATHS.sexAssignedAtBirthAttribute}
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
          <GenderIdentitySection />
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
        </>
      )}
    </BuilderSection>
  );
}
