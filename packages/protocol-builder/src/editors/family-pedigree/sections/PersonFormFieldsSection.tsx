import FormFieldsSection from '../../../sections/form-fields/FormFieldsSection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import { usePedigreeDraftBindings } from './pedigreeSlots.ts';

/**
 * Switching the additional fields off removes the whole `form`: the schema
 * accepts a pedigree with no form, but not one holding an empty list.
 */
const PERSON_FORM_CAPABILITY = Object.freeze({
  fields: ['form'],
  confirmClear: {
    title: messages.personFormClearTitle,
    description: messages.personFormClearDescription,
    confirmLabel: messages.personFormClearConfirm,
  },
});

/**
 * The researcher's own questions about each family member, asked in the side
 * panel after the interface's built-in fields.
 *
 * The shared form-fields section against the stage subject. It may not collect
 * an attribute bound to one of the person attribute slots — the interface
 * already records those — and it is told what the slots write without
 * validation, so the cross-class rule reads this stage's draft rather than its
 * last save.
 */
export default function PersonFormFieldsSection() {
  const { personAttributeVariables, unvalidatedPersonVariables } =
    usePedigreeDraftBindings();

  return (
    <FormFieldsSection
      subject="node"
      capability={PERSON_FORM_CAPABILITY}
      draftUnvalidatedVariables={unvalidatedPersonVariables}
      reservedVariables={personAttributeVariables}
      reservedVariableRefusal={messages.personFormReservedRefusal}
      title={messages.personFormTitle}
      description={messages.personFormDescription}
      fieldLabel={messages.personFormFieldLabel}
      addLabel={messages.personFormAddLabel}
      emptyState={messages.personFormEmptyState}
    />
  );
}
