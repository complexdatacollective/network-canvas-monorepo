import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { INTERFACE_OWNED_OPTION_SETS } from '@codaco/protocol-validation';

import EntityTypePickerField from '../../../fields/EntityTypePickerField.tsx';
import SlotVariableField from '../../../fields/SlotVariableField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import FormFieldsSection from '../../../sections/form-fields/FormFieldsSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import {
  useEntityTypeChangeConfirmation,
  useResetOnEntityTypeChange,
} from './entityTypeReset.ts';
import { pedigreeMessages } from './pedigreeMessages.ts';
import {
  draftRowVariables,
  PEDIGREE_EXCLUSIVE_SLOTS,
  subjectVariableOptions,
} from './slotWiring.ts';

const TYPE_FIELD = 'nodeConfig.type';
const LABEL_FIELD = 'nodeConfig.nodeLabelVariable';
// Path AND slot id together, from the table the live slot index reads: a
// section that spelled its own paths could be renamed out of that index
// without anything failing until two slots collided at a save. The display
// label and the biological sex slot are not exclusive, so they are not in it.
const EGO_SLOT = PEDIGREE_EXCLUSIVE_SLOTS.egoVariable;
const RELATIONSHIP_SLOT = PEDIGREE_EXCLUSIVE_SLOTS.relationshipVariable;
const BIOLOGICAL_SEX_FIELD = 'nodeConfig.biologicalSexVariable';
const FORM_FIELD = 'nodeConfig.form';
/**
 * The attribute id the pedigree's own name control writes through.
 *
 * The interview submits each relative's name on its internal `name` path and
 * filters a form field collecting `name` out for that reason
 * (`interview/src/interfaces/FamilyPedigree/utils/nodeUtils.ts`), so a field
 * bound to it is a question nobody is ever asked. Written down here because
 * the runtime spells it as a literal too, and the two have to agree.
 */
const RESERVED_NAME_VARIABLE = 'name';
const NOMINATION_PROMPTS_FIELD = 'nominationPrompts';

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
 * reset still sends a cause the document has not got, discards or no discards.
 * Taking `nominationPrompts` out of this list instead splits the change into
 * two writes, so the document passes through a state describing the new type
 * with the old type's prompts: measured, and the reason it stays.
 */
const NODE_TYPE_DEPENDENT_FIELDS: readonly string[] = Object.freeze([
  LABEL_FIELD,
  EGO_SLOT.path,
  RELATIONSHIP_SLOT.path,
  BIOLOGICAL_SEX_FIELD,
  FORM_FIELD,
  'nominationPrompts',
]);

/**
 * What a node type change costs, in the pedigree's own words.
 *
 * The list above says which paths go; this says it in a sentence, because the
 * researcher is asked before the reset runs rather than told afterwards. The
 * two are declared together so a path added to one is visibly missing from the
 * other.
 */
const NODE_TYPE_CHANGE_WORDS = Object.freeze({
  title: pedigreeMessages.nodeTypeChangeTitle,
  description: pedigreeMessages.nodeTypeChangeDescription,
  confirmLabel: pedigreeMessages.nodeTypeChangeConfirm,
});

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
    title: pedigreeMessages.memberFormClearTitle,
    description: pedigreeMessages.memberFormClearDescription,
    confirmLabel: pedigreeMessages.memberFormClearConfirm,
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
export default function PedigreeNodeConfigurationSection() {
  const intl = useAppIntl();
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const nodeType = useStageValue(TYPE_FIELD);
  const formRows = useStageValue(FORM_FIELD);
  const nominationRows = useStageValue(NOMINATION_PROMPTS_FIELD);
  const labelDraft = useStageValue(LABEL_FIELD);
  const egoDraft = useStageValue(EGO_SLOT.path);
  const relationshipDraft = useStageValue(RELATIONSHIP_SLOT.path);
  const biologicalSexDraft = useStageValue(BIOLOGICAL_SEX_FIELD);
  useResetOnEntityTypeChange(TYPE_FIELD, NODE_TYPE_DEPENDENT_FIELDS);
  const confirmTypeChange = useEntityTypeChangeConfirmation(
    NODE_TYPE_DEPENDENT_FIELDS,
    NODE_TYPE_CHANGE_WORDS,
  );

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
  // Narrowed by type only. Which of these may actually be bound is decided by
  // their VALUES — the interview and the genetics engine branch on the exact
  // canonical biological-sex set — and the slot field does that itself against
  // the `lockedOptions` it is handed, so that an attribute whose values were
  // edited elsewhere is ruled out and named rather than dropped from the pool.
  const categoricalVariables = useMemo(
    () => variableOptions.filter((option) => option.type === 'categorical'),
    [variableOptions],
  );

  // A structural slot is an UNVALIDATED writer, so it may not take an
  // attribute this stage's own unsaved form already collects — and neither the
  // display label, which IS collected through a form field, nor the form
  // itself may take one this stage writes unvalidated. Both directions read
  // from the live draft: a field, a binding or a nomination prompt made in
  // this session is not saved yet, and one just cleared must free its
  // attribute at once.
  const draftFormVariables = useMemo(
    () => draftRowVariables(formRows),
    [formRows],
  );
  // Every unvalidated writer this stage's draft holds: the three slots, and
  // each nomination toggle — which the participant operates without anything
  // checking the answer, exactly as the slots are written from the tree they
  // draw. The prompts belong here because the shared form-fields section is
  // told to stop reading the OPEN stage out of the saved protocol as soon as
  // it is handed a live list, so a writer missing from this one is a writer
  // nothing accounts for at all.
  const draftUnvalidatedVariables = useMemo(
    () => [
      ...[egoDraft, relationshipDraft, biologicalSexDraft].filter(
        (value): value is string => typeof value === 'string',
      ),
      ...draftRowVariables(nominationRows),
    ],
    [biologicalSexDraft, egoDraft, nominationRows, relationshipDraft],
  );

  /**
   * The attribute the display label names right now, which no structural slot
   * may also write.
   *
   * The label is a VALIDATED writer whose value the participant types, and the
   * three slots below are derived from the tree they draw — so a slot bound to
   * the same attribute overwrites that typed name at finalization. The label
   * already refuses what the slots claim (`draftUnvalidatedVariables`); this is
   * the same rule read from the other end, which was missing: both controls
   * accepted the pick, and the researcher was told nothing until an export
   * showed "parent" where a person's name should have been.
   */
  const draftLabelVariable =
    typeof labelDraft === 'string' && labelDraft !== ''
      ? labelDraft
      : undefined;

  /**
   * What the member form may not collect, because the pedigree collects it
   * itself.
   *
   * Interviewer's `getNodeForm` filters both out of the form it renders — the
   * display label, whose value the dedicated name control writes, and any
   * attribute whose id is literally `name`, which that control submits through
   * — so a field bound to either is a question the researcher wrote, saw
   * accepted, and no participant is ever asked.
   */
  const reservedFormVariables = useMemo(
    () =>
      draftLabelVariable === undefined
        ? [RESERVED_NAME_VARIABLE]
        : [draftLabelVariable, RESERVED_NAME_VARIABLE],
    [draftLabelVariable],
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

  /*
    The stage names reach both sentences as ONE value, joined by the reader's
    own list formatter rather than by a comma this file chose: which separator
    a list of names takes, and whether the last one is introduced by a word at
    all, is a fact about the reader's language.
  */
  const dependentStageNames = intl.formatList(
    dependentNarrativeStages.map((stage) => `"${stage.label}"`),
    { type: 'conjunction' },
  );

  /**
   * Why the node type may not be changed while another stage reads this
   * pedigree.
   *
   * The warning above says what such a change would cost; this refuses it.
   * A narrative pedigree resolves every disease it draws through THIS stage's
   * `nodeConfig.type`, so a change here leaves it naming attributes the new
   * type does not have — a protocol whole-protocol validation refuses, and one
   * this editor cannot repair, because the stage that has to be remapped is
   * not the stage it is editing. Architect refuses the same transition for the
   * same reason.
   */
  const blockChangeReason =
    dependentNarrativeStages.length === 0
      ? undefined
      : intl.formatMessage(pedigreeMessages.dependentStagesBlockReason, {
          stageCount: dependentNarrativeStages.length,
          stageNames: dependentStageNames,
        });

  return (
    <BuilderSection
      title={intl.formatMessage(pedigreeMessages.nodeTitle)}
      description={intl.formatMessage(pedigreeMessages.nodeDescription)}
    >
      {dependentNarrativeStages.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>
            {intl.formatMessage(pedigreeMessages.dependentStagesTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(pedigreeMessages.dependentStagesDescription, {
              stageNames: dependentStageNames,
            })}
          </AlertDescription>
        </Alert>
      )}
      <Field<typeof EntityTypePickerField>
        name={TYPE_FIELD}
        component={EntityTypePickerField}
        entityType="node"
        confirmChange={confirmTypeChange}
        {...(blockChangeReason === undefined ? {} : { blockChangeReason })}
        label={intl.formatMessage(pedigreeMessages.nodeTypeLabel)}
        required={REQUIRED}
      />

      {subject !== null && (
        <>
          <SlotVariableField
            name={LABEL_FIELD}
            label={pedigreeMessages.nodeLabelLabel}
            hint={pedigreeMessages.nodeLabelHint}
            subject={subject}
            options={textVariables}
            writerClass="validated"
            draftConflicting={draftUnvalidatedVariables}
            variableType="text"
            createLabel={pedigreeMessages.nodeLabelCreateLabel}
            emptyMessage={pedigreeMessages.slotEmptyState}
            offerValidation
          />
          <SlotVariableField
            name={EGO_SLOT.path}
            label={pedigreeMessages.nodeEgoLabel}
            hint={pedigreeMessages.nodeEgoHint}
            subject={subject}
            options={booleanVariables}
            writerClass="unvalidated"
            ownSlot={EGO_SLOT.slot}
            draftConflicting={draftFormVariables}
            {...(draftLabelVariable === undefined
              ? {}
              : { draftLabelVariable })}
            variableType="boolean"
            createLabel={pedigreeMessages.nodeEgoCreateLabel}
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
          <SlotVariableField
            name={RELATIONSHIP_SLOT.path}
            label={pedigreeMessages.nodeRelationshipLabel}
            hint={pedigreeMessages.nodeRelationshipHint}
            subject={subject}
            options={textVariables}
            writerClass="unvalidated"
            ownSlot={RELATIONSHIP_SLOT.slot}
            draftConflicting={draftFormVariables}
            {...(draftLabelVariable === undefined
              ? {}
              : { draftLabelVariable })}
            variableType="text"
            createLabel={pedigreeMessages.nodeRelationshipCreateLabel}
            emptyMessage={pedigreeMessages.slotEmptyState}
          />
          <SlotVariableField
            name={BIOLOGICAL_SEX_FIELD}
            label={pedigreeMessages.nodeBiologicalSexLabel}
            hint={pedigreeMessages.nodeBiologicalSexHint}
            subject={subject}
            options={categoricalVariables}
            writerClass="unvalidated"
            draftConflicting={draftFormVariables}
            {...(draftLabelVariable === undefined
              ? {}
              : { draftLabelVariable })}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.biologicalSex.options}
            createLabel={pedigreeMessages.nodeBiologicalSexCreateLabel}
            emptyMessage={pedigreeMessages.slotEmptyState}
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
            it off, and what it is writing unvalidated right now — its three
            slots and its nomination toggles, which the shared section cannot
            find because they are this session's draft rather than anything
            the saved protocol holds.
          */}
          <FormFieldsSection
            subject="node"
            subjectTypePath={TYPE_FIELD}
            fieldsPath={FORM_FIELD}
            optional
            capability={FORM_CAPABILITY}
            draftUnvalidatedVariables={draftUnvalidatedVariables}
            reservedVariables={reservedFormVariables}
            reservedVariableRefusal={pedigreeMessages.memberFormReservedRefusal}
            /*
              The shared section is worded for a form that stands on its own.
              This one is hung off the node configuration of a stage the
              participant adds RELATIVES to, so what it collects is a person in
              a family — which the pedigree is the only thing that knows.
              Descriptors rather than strings, so a translator sees them.
            */
            title={pedigreeMessages.memberFormTitle}
            description={pedigreeMessages.memberFormDescription}
            fieldLabel={pedigreeMessages.memberFormFieldLabel}
            addLabel={pedigreeMessages.memberFormAddLabel}
            emptyState={pedigreeMessages.memberFormEmptyState}
          />
        </>
      )}
    </BuilderSection>
  );
}
