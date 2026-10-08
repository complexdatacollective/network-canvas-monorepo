import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';

import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import BuilderSection, {
  type SectionCapability,
} from '../../../sections/BuilderSection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  NODE_CONFIGURATION_PATHS,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/**
 * Switching the recording off removes the binding from the stage; the
 * attribute stays in the codebook.
 */
const RELATIONSHIP_TO_PARTICIPANT_CAPABILITY: SectionCapability = Object.freeze(
  {
    fields: [NODE_CONFIGURATION_PATHS.relationshipToParticipantAttribute],
    confirmClear: {
      title: messages.relationshipToParticipantClearTitle,
      description: messages.relationshipToParticipantClearDescription,
      confirmLabel: messages.relationshipToParticipantClearConfirm,
    },
  },
);

/**
 * Whether the stage saves each person's relationship to the participant as
 * an attribute, so that later stages can filter or skip on it: a filter
 * tests only a person's own attributes. A subsection of the person
 * attributes, off unless the stage already holds the binding.
 *
 * The attribute is categorical and its values belong to the interface, as
 * sex assigned at birth's do: an attribute with other options is ruled out,
 * and one created here is seeded with exactly those values, labelled in the
 * researcher's language for them to translate. The interface writes it
 * itself, so it is an exclusive slot: no form field or other answer may
 * collect it.
 */
export default function RelationshipToParticipantSection() {
  const intl = useAppIntl();
  const { personSubject, draftWriterMap, validatedPersonVariables } =
    usePedigreeDraftBindings();
  const optionLabel = useCallback(
    (value: string) =>
      intl.formatMessage(messages.relationshipToParticipantOption, { value }),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.relationshipToParticipantTitle)}
      description={intl.formatMessage(
        messages.relationshipToParticipantDescription,
      )}
      capability={RELATIONSHIP_TO_PARTICIPANT_CAPABILITY}
    >
      {personSubject !== null && (
        <SlotVariableField
          name={NODE_CONFIGURATION_PATHS.relationshipToParticipantAttribute}
          label={messages.relationshipToParticipantLabel}
          hint={messages.relationshipToParticipantHint}
          createLabel={messages.relationshipToParticipantCreateLabel}
          subject={personSubject}
          variableType="categorical"
          writerClass="unvalidated"
          ownSlot={FAMILY_PEDIGREE_SLOTS.relationshipToParticipantAttribute}
          ownedOptions="pedigreeRelationshipToParticipant"
          ownedOptionLabel={optionLabel}
          draftConflicting={validatedPersonVariables}
          draftSlotMap={draftWriterMap}
        />
      )}
    </BuilderSection>
  );
}
