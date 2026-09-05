import { useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import {
  FAMILY_PEDIGREE_SLOTS,
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
} from '@codaco/protocol-validation';

import { EntitySelectControl } from '../../fields/EntitySelectField.tsx';
import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField from '../../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import BuilderSection from '../BuilderSection.tsx';
import {
  type RowEditorComponent,
  type RowPreviewComponent,
  useRowRenderers,
} from '../rowRenderers.tsx';
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
  addFormFieldTitle: string;
  editFormFieldTitle: string;
  /** Noun used in row affordances ("Edit field", "Remove field"). */
  formFieldItemLabel: string;
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
  addFormFieldTitle: 'Create form field',
  editFormFieldTitle: 'Edit form field',
  formFieldItemLabel: 'field',
  formFieldsEmptyMessage:
    'No form fields yet. Create one to ask something about each family member.',
};

export type PedigreeNodeConfigurationSectionProps = Readonly<{
  /**
   * The family's own form-field editor, rendered inside the row dialog.
   *
   * What a form field CAN be — which attribute it collects, which input
   * control it uses, how it is validated — is shared with every other form in
   * the protocol, and belongs to the form-fields family rather than to the
   * pedigree. What the pedigree owns is that this list exists, that it hangs
   * off the node type, and that its attributes may not also be written
   * structurally.
   */
  FormFieldEditor: RowEditorComponent;
  /** How one form field reads in the list when its dialog is closed. */
  FormFieldPreview: RowPreviewComponent;
  copy?: Partial<PedigreeNodeConfigurationCopy>;
}>;

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
  FormFieldEditor,
  FormFieldPreview,
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
  // attribute this stage's own unsaved form already collects — and the display
  // label, which IS collected through a form field, may not take one the
  // structural slots claim. Read from the live rows: a field added in this
  // session is not saved yet, and one just deleted must free its attribute at
  // once.
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

  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    FormFieldEditor,
    FormFieldPreview,
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

          <BuilderSection
            title={words.formSectionTitle}
            description={words.formSectionDescription}
            capability={{
              fields: [FORM_FIELD],
              confirmClear: {
                title: 'This will delete the family member form',
                description:
                  'Every field you have added to it will be removed, and participants will no longer be asked anything when they add a family member.',
                confirmLabel: 'Delete the form',
              },
            }}
          >
            <ProtocolArrayField<typeof DialogArrayField>
              name={FORM_FIELD}
              label={words.formFieldsLabel}
              hint={words.formFieldsHint}
              component={DialogArrayField}
              addButtonLabel={words.addFormFieldLabel}
              addTitle={words.addFormFieldTitle}
              editorTitle={words.editFormFieldTitle}
              itemLabel={words.formFieldItemLabel}
              emptyStateMessage={words.formFieldsEmptyMessage}
              editorFieldsComponent={editorFieldsComponent}
              previewComponent={previewComponent}
              editorDialogSize="editor"
              normalizeItem={withoutAbsentValues}
              sortable
            />
          </BuilderSection>
        </>
      )}
    </BuilderSection>
  );
}
