import { useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import {
  FAMILY_PEDIGREE_SLOTS,
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
} from '@codaco/protocol-validation';

import { EntitySelectControl } from '../../fields/EntitySelectField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import BuilderSection from '../BuilderSection.tsx';
import FormFieldsSection from '../FormFieldsSection.tsx';
import { useResetOnEntityTypeChange } from './entityTypeReset.ts';
import SlotVariableField from './SlotVariableField.tsx';
import {
  draftFormFieldVariables,
  subjectVariableOptions,
} from './slotWiring.ts';

const TYPE_FIELD = 'nodeConfig.type';
const LABEL_FIELD = 'nodeConfig.nodeLabelVariable';
const EGO_FIELD = 'nodeConfig.egoVariable';
const RELATIONSHIP_FIELD = 'nodeConfig.relationshipVariable';
const BIOLOGICAL_SEX_FIELD = 'nodeConfig.biologicalSexVariable';
const FORM_FIELD = 'nodeConfig.form';

/**
 * Everything a node-type change invalidates.
 *
 * Each of these names an attribute of the node type, so carrying any of it
 * across to a different type leaves the stage referring to attributes that
 * type does not have. The pedigree's framing, boundaries, census prompt and
 * edge configuration say nothing about the node type and are deliberately
 * absent: clearing them would leave a stage the schema refuses.
 *
 * `nominationPrompts` is here even though its own section also names this path
 * in `resetOn` — that is how its switch goes off with the prompts it lost —
 * and the two do not collide. This reset runs first (it belongs to the earlier
 * section, and passive effects run in tree order), so the prompts section
 * finds nothing left at its path AND finds the draft already holding the type
 * it would name as its cause, which is what leaves it nothing to write: a
 * reset still sends a cause the draft has not got, discards or no discards.
 * Taking `nominationPrompts` out of this list instead splits the change into
 * TWO batches, and one undo then restores only half of it: measured, and the
 * reason it stays.
 */
const NODE_TYPE_DEPENDENT_FIELDS: readonly string[] = Object.freeze([
  LABEL_FIELD,
  EGO_FIELD,
  RELATIONSHIP_FIELD,
  BIOLOGICAL_SEX_FIELD,
  FORM_FIELD,
  'nominationPrompts',
]);

const NO_ATTRIBUTES_MESSAGE =
  'No attributes of this type can be used here yet. Create one to continue.';

export type PedigreeNodeConfigurationCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  typeLabel: string;
  typeHint: string;
  /** Names the nested form-fields section in the outline. */
  formSectionTitle: string;
  formSectionDescription: string;
  formFieldsLabel: string;
  formFieldsHint: string;
  /** Visible text and accessible name of the add button. */
  addFormFieldLabel: string;
  formFieldsEmptyMessage: string;
}>;

const DEFAULT_COPY: PedigreeNodeConfigurationCopy = {
  sectionTitle: 'Family member data',
  description:
    'Choose the node type and map the attributes used to represent family members.',
  typeLabel: 'Node type',
  typeHint:
    'Every family member the participant adds will be a node of this type.',
  formSectionTitle: 'Family member form',
  formSectionDescription:
    'Optionally ask the participant more about each family member as they add them.',
  formFieldsLabel: 'Form fields',
  formFieldsHint:
    'The participant answers these when they add or edit a family member. Drag to reorder them.',
  addFormFieldLabel: 'Create new form field',
  formFieldsEmptyMessage:
    'No form fields yet. Create one to ask something about each family member.',
};

export type PedigreeNodeConfigurationSectionProps = Readonly<{
  copy?: Partial<PedigreeNodeConfigurationCopy>;
}>;

/**
 * What switching the family member form off means, in the pedigree's words.
 *
 * The shared form-fields section owns the list; what a researcher loses by
 * turning it off is a fact about THIS interface — participants stop being
 * asked anything as they add family members — so the pedigree says it.
 */
const FORM_CAPABILITY = Object.freeze({
  fields: [FORM_FIELD],
  confirmClear: {
    title: 'This will delete the family member form',
    description:
      'Every field you have added to it will be removed, and participants will no longer be asked anything when they add a family member.',
    confirmLabel: 'Delete the form',
  },
});

/**
 * The node type the pedigree draws people as, and the attributes it writes on
 * them.
 *
 * The four attribute slots are what make a node type a pedigree: which node is
 * the participant, how each person relates to them, what each is called, and
 * the sex the genetics engine traces inheritance through. Each is picked from
 * the codebook or created on the spot, and each is gated so a pedigree cannot
 * quietly take over an attribute another part of the protocol already writes.
 */
export default function PedigreeNodeConfigurationSection({
  copy,
}: PedigreeNodeConfigurationSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { identity, protocolContext } = useStageEditorForm();
  const nodeType = useStageValue(TYPE_FIELD);
  const formRows = useStageValue(FORM_FIELD);
  const egoDraft = useStageValue(EGO_FIELD);
  const relationshipDraft = useStageValue(RELATIONSHIP_FIELD);
  const biologicalSexDraft = useStageValue(BIOLOGICAL_SEX_FIELD);
  useResetOnEntityTypeChange(TYPE_FIELD, NODE_TYPE_DEPENDENT_FIELDS);

  const subject: CodebookSubject | null = useMemo(
    () =>
      typeof nodeType === 'string' ? { entity: 'node', type: nodeType } : null,
    [nodeType],
  );

  const variableOptions = useMemo(
    () => subjectVariableOptions(protocolContext, subject),
    [protocolContext, subject],
  );
  const textVariables = useMemo(
    () => variableOptions.filter((option) => option.type === 'text'),
    [variableOptions],
  );
  const booleanVariables = useMemo(
    () => variableOptions.filter((option) => option.type === 'boolean'),
    [variableOptions],
  );
  // Only categorical attributes whose options are exactly the canonical
  // biological-sex set may be bound: the interview and the genetics engine
  // branch on those exact values, so an attribute with a different value set
  // would silently degrade sex resolution. Asked with the protocol schema's
  // OWN comparison, so the picker cannot offer something the schema refuses.
  const biologicalSexVariables = useMemo(
    () =>
      variableOptions.filter(
        (option) =>
          option.type === 'categorical' &&
          optionsMatchInterfaceOwnedSet(
            option.options === undefined ? undefined : [...option.options],
            INTERFACE_OWNED_OPTION_SETS.biologicalSex.options,
          ),
      ),
    [variableOptions],
  );

  // A structural slot is an UNVALIDATED writer, so it may not take an
  // attribute this stage's own unsaved form already collects — and neither the
  // display label, which IS collected through a form field, nor the form
  // itself may take one the structural slots claim. Both directions read from
  // the live draft: a field or a binding made in this session is not saved
  // yet, and one just cleared must free its attribute at once.
  const draftFormVariables = useMemo(
    () => draftFormFieldVariables(formRows),
    [formRows],
  );
  const draftStructuralVariables = useMemo(
    () =>
      [egoDraft, relationshipDraft, biologicalSexDraft].filter(
        (value): value is string => typeof value === 'string',
      ),
    [biologicalSexDraft, egoDraft, relationshipDraft],
  );

  const dependentNarrativeStages = useMemo(
    () =>
      protocolContext.orderedStages.filter(
        (stage) =>
          stage.type === 'NarrativePedigree' &&
          Reflect.get(stage, 'sourceStageId') === identity.id,
      ),
    [identity.id, protocolContext.orderedStages],
  );

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      {dependentNarrativeStages.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Other stages read this pedigree</AlertTitle>
          <AlertDescription>
            {`These stages visualise this pedigree's network and map their own attributes onto its node type: ${dependentNarrativeStages
              .map((stage) => `"${stage.label}"`)
              .join(
                ', ',
              )}. Changing the node type here will leave them pointing at attributes the new type does not have.`}
          </AlertDescription>
        </Alert>
      )}
      <ProtocolField<typeof EntitySelectControl>
        name={TYPE_FIELD}
        component={EntitySelectControl}
        entityType="node"
        label={words.typeLabel}
        hint={words.typeHint}
        required
      />

      {subject !== null && (
        <>
          <SlotVariableField
            name={LABEL_FIELD}
            label="Display label"
            hint="A text attribute holding the name shown on each family member other than the participant, who is drawn without one."
            subject={subject}
            options={textVariables}
            writerClass="validated"
            draftConflicting={draftStructuralVariables}
            variableType="text"
            createLabel="Create a new display label attribute"
            createDescription="Create a text attribute for family member names"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />
          <SlotVariableField
            name={EGO_FIELD}
            label="Participant identifier"
            hint="A boolean attribute marking which node is the participant. Every completeness check keys off it, so nothing else may write it."
            subject={subject}
            options={booleanVariables}
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.egoVariable}
            draftConflicting={draftFormVariables}
            variableType="boolean"
            createLabel="Create a new participant identifier attribute"
            createDescription="Create a boolean attribute marking the participant"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />
          <SlotVariableField
            name={RELATIONSHIP_FIELD}
            label="Relationship to participant"
            hint="A text attribute holding each person's relationship to the participant, such as mother, uncle, or daughter. The pedigree works this out from the family tree."
            subject={subject}
            options={textVariables}
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.relationshipVariable}
            draftConflicting={draftFormVariables}
            variableType="text"
            createLabel="Create a new relationship attribute"
            createDescription="Create a text attribute for each relationship to the participant"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />
          <SlotVariableField
            name={BIOLOGICAL_SEX_FIELD}
            label="Biological sex"
            hint="A categorical attribute holding each family member's sex recorded at birth, which the pedigree traces sex-linked inheritance through. Its values are fixed by the interface."
            subject={subject}
            options={biologicalSexVariables}
            writerClass="unvalidated"
            draftConflicting={draftFormVariables}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.biologicalSex.options}
            createLabel="Create a new biological sex attribute"
            createDescription="Create the categorical attribute the pedigree records sex in"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />

          {/*
            The package's shared form-fields section, told where this
            interface keeps its form. What a field CAN be — which attribute it
            collects, how the participant answers it, how the answer is
            validated — is the same question every form in the protocol asks,
            so the pedigree does not answer it a second time. What it does own
            is where the list lives (`nodeConfig.form`), which type it
            collects into (`nodeConfig.type` rather than a stage `subject`),
            that the form may be left out altogether, what is lost by switching
            it off, and which of its own slots are writing unvalidated right
            now — the three below are the pedigree's unvalidated writers, and
            the shared section cannot find them because they are this session's
            draft rather than anything the saved protocol holds.
          */}
          <FormFieldsSection
            subject="node"
            subjectTypePath={TYPE_FIELD}
            fieldsPath={FORM_FIELD}
            optional
            capability={FORM_CAPABILITY}
            draftUnvalidatedVariables={draftStructuralVariables}
            copy={{
              sectionTitle: words.formSectionTitle,
              description: words.formSectionDescription,
              fieldLabel: words.formFieldsLabel,
              fieldHint: words.formFieldsHint,
              addButtonLabel: words.addFormFieldLabel,
              emptyStateMessage: words.formFieldsEmptyMessage,
            }}
          />
        </>
      )}
    </BuilderSection>
  );
}
