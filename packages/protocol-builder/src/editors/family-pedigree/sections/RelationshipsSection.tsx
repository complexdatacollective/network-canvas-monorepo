import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';

import EntityTypePickerField, {
  type EntityTypeChangeConfirmation,
} from '../../../fields/EntityTypePickerField.tsx';
import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import {
  useAskStageHasAnyValue,
  useDiscardStageValues,
} from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useOnResearcherChange } from '../../../sections/researcherChange.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  EDGE_CONFIGURATION_PATHS,
  EDGE_CONFIGURATION_TYPE_PATH,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/** Every slot naming an attribute of the edge type, lost when it changes. */
const EDGE_TYPE_DEPENDENT_PATHS: readonly string[] = Object.freeze(
  Object.values(EDGE_CONFIGURATION_PATHS),
);

/**
 * Throws away the relationship attributes when the researcher picks a
 * different edge type, after asking when there is something to lose: an
 * attribute reference means nothing against a different type. The discard
 * carries the type change that caused it, so the document never holds one
 * without the other.
 */
function useEdgeTypeChange(): () => EntityTypeChangeConfirmation | undefined {
  const intl = useAppIntl();
  const hasAnyValue = useAskStageHasAnyValue();
  const discardStageValues = useDiscardStageValues();

  useOnResearcherChange(EDGE_CONFIGURATION_TYPE_PATH, (value) => {
    discardStageValues(EDGE_TYPE_DEPENDENT_PATHS, {
      path: EDGE_CONFIGURATION_TYPE_PATH,
      value,
    });
  });

  return useCallback(() => {
    if (!hasAnyValue(EDGE_TYPE_DEPENDENT_PATHS)) return undefined;
    return {
      title: intl.formatMessage(messages.relationshipTypeChangeTitle),
      description: intl.formatMessage(
        messages.relationshipTypeChangeDescription,
      ),
      confirmLabel: intl.formatMessage(messages.relationshipTypeChangeConfirm),
    };
  }, [hasAnyValue, intl]);
}

/**
 * The edge type every family relationship is recorded as, and the attributes
 * the interface writes onto it: the kind of relationship (an owned value set),
 * whether a parent carried the pregnancy, and whether a partnership is
 * current. All three are written by the interface itself and exclusive to
 * their slots.
 */
export default function RelationshipsSection() {
  const intl = useAppIntl();
  const { relationshipSubject, draftSlotMap } = usePedigreeDraftBindings();
  const confirmTypeChange = useEdgeTypeChange();

  return (
    <BuilderSection
      title={intl.formatMessage(messages.relationshipsTitle)}
      description={intl.formatMessage(messages.relationshipsDescription)}
    >
      <Field<typeof EntityTypePickerField>
        name={EDGE_CONFIGURATION_TYPE_PATH}
        component={EntityTypePickerField}
        entityType="edge"
        confirmChange={confirmTypeChange}
        label={intl.formatMessage(messages.relationshipTypeLabel)}
        hint={intl.formatMessage(messages.relationshipTypeHint)}
        required={REQUIRED}
      />
      {relationshipSubject !== null && (
        <>
          <SlotVariableField
            name={EDGE_CONFIGURATION_PATHS.kindAttribute}
            label={messages.kindLabel}
            hint={messages.kindHint}
            createLabel={messages.kindCreateLabel}
            subject={relationshipSubject}
            variableType="categorical"
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.relationshipKindAttribute}
            ownedOptions="pedigreeRelationship"
            draftSlotMap={draftSlotMap}
          />
          <SlotVariableField
            name={EDGE_CONFIGURATION_PATHS.gestationalCarrierAttribute}
            label={messages.gestationalCarrierLabel}
            hint={messages.gestationalCarrierHint}
            createLabel={messages.gestationalCarrierCreateLabel}
            subject={relationshipSubject}
            variableType="boolean"
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.gestationalCarrierAttribute}
            draftSlotMap={draftSlotMap}
          />
          <SlotVariableField
            name={EDGE_CONFIGURATION_PATHS.currentPartnerAttribute}
            label={messages.currentPartnerLabel}
            hint={messages.currentPartnerHint}
            createLabel={messages.currentPartnerCreateLabel}
            subject={relationshipSubject}
            variableType="boolean"
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.currentPartnerAttribute}
            draftSlotMap={draftSlotMap}
          />
        </>
      )}
    </BuilderSection>
  );
}
