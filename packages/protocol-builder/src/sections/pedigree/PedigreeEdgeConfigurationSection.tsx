import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { INTERFACE_OWNED_OPTION_SETS } from '@codaco/protocol-validation';

import EntityTypePickerField from '../../fields/EntityTypePickerField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
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
  const protocolContext = useProtocolContext();
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
  // Narrowed by type only. Which of these may actually be bound is decided by
  // their VALUES — the interview writes the exact canonical set onto the edges
  // it draws, and the genetics engine branches on it — and the slot field does
  // that itself against the `lockedOptions` it is handed, so that an attribute
  // whose values were edited elsewhere is ruled out and named rather than
  // dropped from the pool.
  const categoricalVariables = useMemo(
    () => variableOptions.filter((option) => option.type === 'categorical'),
    [variableOptions],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(pedigreeMessages.edgeTitle)}
      description={intl.formatMessage(pedigreeMessages.edgeDescription)}
    >
      <Field<typeof EntityTypePickerField>
        name={TYPE_FIELD}
        component={EntityTypePickerField}
        entityType="edge"
        confirmChange={confirmTypeChange}
        label={intl.formatMessage(pedigreeMessages.edgeTypeLabel)}
        hint={intl.formatMessage(pedigreeMessages.edgeTypeHint)}
        required={REQUIRED}
      />

      {subject !== null && (
        <>
          <SlotVariableField
            name={RELATIONSHIP_TYPE_SLOT.path}
            label={pedigreeMessages.edgeRelationshipTypeLabel}
            hint={pedigreeMessages.edgeRelationshipTypeHint}
            subject={subject}
            options={categoricalVariables}
            writerClass="unvalidated"
            ownSlot={RELATIONSHIP_TYPE_SLOT.slot}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.relationshipType.options}
            createLabel={pedigreeMessages.edgeRelationshipTypeCreateLabel}
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
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
          <SlotVariableField
            name={GAMETE_ROLE_SLOT.path}
            label={pedigreeMessages.edgeGameteRoleLabel}
            hint={pedigreeMessages.edgeGameteRoleHint}
            subject={subject}
            options={categoricalVariables}
            writerClass="unvalidated"
            ownSlot={GAMETE_ROLE_SLOT.slot}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.gameteRole.options}
            createLabel={pedigreeMessages.edgeGameteRoleCreateLabel}
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
        </>
      )}
    </BuilderSection>
  );
}
