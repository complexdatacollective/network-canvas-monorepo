import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
  type InterfaceOwnedOptionSetKey,
} from '@codaco/protocol-validation';

import { EntitySelectControl } from '../../fields/EntitySelectField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import BuilderSection from '../BuilderSection.tsx';
import {
  useEntityTypeChangeConfirmation,
  useResetOnEntityTypeChange,
} from './entityTypeReset.ts';
import { pedigreeMessages } from './pedigreeMessages.ts';
import SlotVariableField from './SlotVariableField.tsx';
import {
  PEDIGREE_EXCLUSIVE_SLOTS,
  subjectVariableOptions,
  type SlotVariableOption,
} from './slotWiring.ts';

const TYPE_FIELD = 'edgeConfig.type';
// Path AND slot id together, from the table the live slot index reads: a
// section that spelled its own paths could be renamed out of that index
// without anything failing until two slots collided at a save.
const RELATIONSHIP_TYPE_SLOT =
  PEDIGREE_EXCLUSIVE_SLOTS.relationshipTypeVariable;
const IS_ACTIVE_SLOT = PEDIGREE_EXCLUSIVE_SLOTS.isActiveVariable;
const GESTATIONAL_CARRIER_SLOT =
  PEDIGREE_EXCLUSIVE_SLOTS.isGestationalCarrierVariable;
const GAMETE_ROLE_SLOT = PEDIGREE_EXCLUSIVE_SLOTS.gameteRoleVariable;

/**
 * Every slot that names an attribute of the edge type, and so cannot survive a
 * change of edge type.
 */
const EDGE_TYPE_DEPENDENT_FIELDS: readonly string[] = Object.freeze([
  RELATIONSHIP_TYPE_SLOT.path,
  IS_ACTIVE_SLOT.path,
  GESTATIONAL_CARRIER_SLOT.path,
  GAMETE_ROLE_SLOT.path,
]);

/** What an edge type change costs, in the pedigree's own words. */
const EDGE_TYPE_CHANGE_WORDS = Object.freeze({
  title: pedigreeMessages.edgeTypeChangeTitle,
  description: pedigreeMessages.edgeTypeChangeDescription,
  confirmLabel: pedigreeMessages.edgeTypeChangeConfirm,
});

/**
 * The edge type the pedigree records relationships as, and the attributes it
 * writes on them.
 *
 * Every slot here is structural: the participant draws a family tree and the
 * interface writes these attributes from it, so each is exclusive to its own
 * slot and none of them may be collected by a form. Unlike the node type there
 * is no validated sibling to check against — the pedigree collects nothing on
 * its edges.
 */
export default function PedigreeEdgeConfigurationSection() {
  const intl = useAppIntl();
  const { protocolContext } = useStageEditorForm();
  const edgeType = useStageValue(TYPE_FIELD);
  useResetOnEntityTypeChange(TYPE_FIELD, EDGE_TYPE_DEPENDENT_FIELDS);
  const confirmTypeChange = useEntityTypeChangeConfirmation(
    EDGE_TYPE_DEPENDENT_FIELDS,
    EDGE_TYPE_CHANGE_WORDS,
  );

  const subject: CodebookSubject | null = useMemo(
    () =>
      typeof edgeType === 'string' ? { entity: 'edge', type: edgeType } : null,
    [edgeType],
  );

  const variableOptions = useMemo(
    () => subjectVariableOptions(protocolContext, subject),
    [protocolContext, subject],
  );
  const booleanVariables = useMemo(
    () => variableOptions.filter((option) => option.type === 'boolean'),
    [variableOptions],
  );
  // Only categorical attributes carrying exactly the canonical value set may be
  // bound: the interview writes these exact values onto the edges it draws, and
  // the genetics engine branches on them. Asked with the protocol schema's own
  // comparison, so a picker can never offer what the schema then refuses.
  const matchingOwnedOptions = useMemo(
    () =>
      (setKey: InterfaceOwnedOptionSetKey): SlotVariableOption[] =>
        variableOptions.filter(
          (option) =>
            option.type === 'categorical' &&
            optionsMatchInterfaceOwnedSet(
              option.options === undefined ? undefined : [...option.options],
              INTERFACE_OWNED_OPTION_SETS[setKey].options,
            ),
        ),
    [variableOptions],
  );
  const relationshipTypeVariables = useMemo(
    () => matchingOwnedOptions('relationshipType'),
    [matchingOwnedOptions],
  );
  const gameteRoleVariables = useMemo(
    () => matchingOwnedOptions('gameteRole'),
    [matchingOwnedOptions],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(pedigreeMessages.edgeTitle)}
      description={intl.formatMessage(pedigreeMessages.edgeDescription)}
    >
      <ProtocolField<typeof EntitySelectControl>
        name={TYPE_FIELD}
        component={EntitySelectControl}
        entityType="edge"
        confirmChange={confirmTypeChange}
        label={intl.formatMessage(pedigreeMessages.edgeTypeLabel)}
        hint={intl.formatMessage(pedigreeMessages.edgeTypeHint)}
        required
      />

      {subject !== null && (
        <>
          <SlotVariableField
            name={RELATIONSHIP_TYPE_SLOT.path}
            label={pedigreeMessages.edgeRelationshipTypeLabel}
            hint={pedigreeMessages.edgeRelationshipTypeHint}
            subject={subject}
            options={relationshipTypeVariables}
            writerClass="unvalidated"
            ownSlot={RELATIONSHIP_TYPE_SLOT.slot}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.relationshipType.options}
            createLabel={pedigreeMessages.edgeRelationshipTypeCreateLabel}
            createDescription={
              pedigreeMessages.edgeRelationshipTypeCreateDescription
            }
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
          <SlotVariableField
            name={IS_ACTIVE_SLOT.path}
            label={pedigreeMessages.edgeIsActiveLabel}
            hint={pedigreeMessages.edgeIsActiveHint}
            subject={subject}
            options={booleanVariables}
            writerClass="unvalidated"
            ownSlot={IS_ACTIVE_SLOT.slot}
            variableType="boolean"
            createLabel={pedigreeMessages.edgeIsActiveCreateLabel}
            createDescription={pedigreeMessages.edgeIsActiveCreateDescription}
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
          <SlotVariableField
            name={GESTATIONAL_CARRIER_SLOT.path}
            label={pedigreeMessages.edgeGestationalCarrierLabel}
            hint={pedigreeMessages.edgeGestationalCarrierHint}
            subject={subject}
            options={booleanVariables}
            writerClass="unvalidated"
            ownSlot={GESTATIONAL_CARRIER_SLOT.slot}
            variableType="boolean"
            createLabel={pedigreeMessages.edgeGestationalCarrierCreateLabel}
            createDescription={
              pedigreeMessages.edgeGestationalCarrierCreateDescription
            }
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
          <SlotVariableField
            name={GAMETE_ROLE_SLOT.path}
            label={pedigreeMessages.edgeGameteRoleLabel}
            hint={pedigreeMessages.edgeGameteRoleHint}
            subject={subject}
            options={gameteRoleVariables}
            writerClass="unvalidated"
            ownSlot={GAMETE_ROLE_SLOT.slot}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.gameteRole.options}
            createLabel={pedigreeMessages.edgeGameteRoleCreateLabel}
            createDescription={pedigreeMessages.edgeGameteRoleCreateDescription}
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
        </>
      )}
    </BuilderSection>
  );
}
