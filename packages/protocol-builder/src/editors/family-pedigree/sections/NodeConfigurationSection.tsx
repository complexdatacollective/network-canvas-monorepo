import { get } from 'es-toolkit/compat';
import { useMemo } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import {
  FAMILY_PEDIGREE_SLOTS,
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  type PedigreeDefaultGenderIdentityValue,
} from '@codaco/protocol-validation';

import GenderIdentityTermsField from '../../../fields/GenderIdentityTermsField.tsx';
import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  NODE_CONFIGURATION_PATHS,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/**
 * The mapping the field starts from: what the stage already holds, else none.
 * An `initialValue` replaces what the form would otherwise seed from the
 * document, so the saved mapping has to be handed back to it.
 */
const startingTerms = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value as unknown[]).filter(
        (term): term is Record<string, unknown> =>
          typeof term === 'object' && term !== null && !Array.isArray(term),
      )
    : [];

/** The suggested label of each option a new gender identity attribute starts with. */
const DEFAULT_GENDER_OPTION_LABELS: Record<
  PedigreeDefaultGenderIdentityValue,
  MessageDescriptor
> = {
  woman: messages.genderOptionWoman,
  man: messages.genderOptionMan,
  nonBinary: messages.genderOptionNonBinary,
  differentIdentity: messages.genderOptionDifferentIdentity,
  unknown: messages.genderOptionUnknown,
  preferNotToSay: messages.genderOptionPreferNotToSay,
};

/**
 * The attributes of the person node type the interface records about every
 * family member: their name, gender identity and sex assigned at birth (asked
 * in the side panel), and the marker it sets on the participant.
 *
 * The researcher binds each slot. The name is collected from the participant
 * with the attribute's own validation (a VALIDATED writer); the other three
 * are written by the interface itself (UNVALIDATED), so none of them may be an
 * attribute a validated control collects, here or elsewhere in the protocol.
 * Sex assigned at birth uses a value set the interface owns, and the
 * participant marker is exclusive to its slot. Gender identity's options are
 * the researcher's: a new attribute starts from a suggested list, and the
 * mapping beneath the picker says which kinship words each option takes.
 */
export default function NodeConfigurationSection() {
  const intl = useAppIntl();
  const { committedFields, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const {
    personSubject,
    draftSlotMap,
    validatedPersonVariables,
    unvalidatedPersonVariables,
  } = usePedigreeDraftBindings();
  const waiting = personSubject === null;

  // What a new gender identity attribute starts with, and the words each of
  // those options takes. Staged on the terms field, which may not be mounted
  // until the new attribute reaches the codebook; the form holds a value
  // written to a field that is not yet there until it mounts.
  const seedOptions = useMemo(
    () =>
      PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value }) => ({
        value,
        label: intl.formatMessage(DEFAULT_GENDER_OPTION_LABELS[value]),
      })),
    [intl],
  );

  const genderVariableId = useStageValue(
    NODE_CONFIGURATION_PATHS.genderIdentityVariable,
  );
  const genderVariable =
    personSubject === null || typeof genderVariableId !== 'string'
      ? undefined
      : variablesForSubject(protocolContext, personSubject)[genderVariableId];
  const genderOptions =
    genderVariable?.type === 'categorical' ? genderVariable.options : undefined;
  const committedTerms = startingTerms(
    get(committedFields, NODE_CONFIGURATION_PATHS.genderIdentityTerms),
  );

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
            seedOptions={seedOptions}
            onCreated={() =>
              storeApi.getState().setFieldValue(
                NODE_CONFIGURATION_PATHS.genderIdentityTerms,
                PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value, words }) => ({
                  value,
                  words,
                })),
              )
            }
            draftConflicting={validatedPersonVariables}
            draftSlotMap={draftSlotMap}
          />
          {genderOptions !== undefined && (
            <Field<typeof GenderIdentityTermsField>
              name={NODE_CONFIGURATION_PATHS.genderIdentityTerms}
              component={GenderIdentityTermsField}
              label={intl.formatMessage(messages.genderTermsLabel)}
              hint={intl.formatMessage(messages.genderTermsHint)}
              options={genderOptions}
              initialValue={committedTerms}
            />
          )}
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
