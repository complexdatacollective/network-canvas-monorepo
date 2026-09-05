import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import type { CrossClassPick } from '../../codebook/variableValidation.ts';
import RichTextField from '../../fields/RichTextField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import PromptsSection, { type PromptsCopy } from '../PromptsSection.tsx';
import type { RowEditorProps } from '../rowRenderers.tsx';
import CreateEdgeField from './CreateEdgeField.tsx';
import PromptAttributeField from './PromptAttributeField.tsx';
import { edgeSubjectOf, usePromptPickGate } from './promptCodebook.ts';
import { PromptTextField, PromptTextPreview } from './promptText.tsx';

/** The strength is a point on a scale, so only an ordinal attribute holds it. */
const STRENGTH_TYPES: readonly VariableType[] = Object.freeze(['ordinal']);

/**
 * The participant answers by tapping one of the scale's own values, which
 * writes the attribute without asking anything a form could validate.
 */
const PICKS: readonly CrossClassPick[] = Object.freeze([
  { path: 'edgeVariable', writerClass: 'unvalidated' },
]);

/**
 * How many points the scale itself can carry.
 *
 * The decline answer is drawn beside them and is not counted, because it is
 * not one of the attribute's values — it is always there, whatever the
 * attribute holds, so counting it would only shift this number by one and
 * would make the warning say something about a control it cannot see.
 * Architect counts the same way, though its wording claims otherwise
 * (`TieStrengthCensusPrompts/PromptFields.tsx`).
 */
const SCALE_LIMIT = 5;

const PROMPTS_COPY: Partial<PromptsCopy> = {
  description:
    'Write the questions this stage asks about each pair, and drag them into the order the participant answers them.',
  fieldHint:
    'The participant is shown one pair of people at a time and answers these questions about them, in this order.',
};

function TieStrengthGuidance() {
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        The participant sees two people side by side and answers on a scale, so
        write the question about the pair in front of them — &ldquo;how close
        are these two people?&rdquo; rather than a name — and phrase it so that
        every point on the scale is a sensible answer.
      </AlertDescription>
    </Alert>
  );
}

/**
 * One Tie-Strength Census question: what to ask, what an answer connects, how
 * strong that connection is said to be, and how the participant says there is
 * none.
 */
function TieStrengthCensusPromptEditor({ item }: RowEditorProps) {
  const { createEdge } = useFormValue(['createEdge'] as const);
  const edgeSubject = edgeSubjectOf(createEdge);
  const committed =
    typeof item.edgeVariable === 'string' ? item.edgeVariable : '';

  return (
    <>
      <PromptTextField
        guidance={<TieStrengthGuidance />}
        placeholder="How close are these two people?"
      />
      <CreateEdgeField
        title="Connection created"
        description="Choose the kind of connection an answer on the scale records between the pair."
        label="Connection created"
        hint="A connection of this type is created between the two people whenever the participant answers on the scale."
        requiredMessage="Choose the type of connection this prompt creates."
        createLabel="Create a new connection type"
        createDescription="Create a connection type and use it for this prompt"
      />
      {/*
        The scale belongs to the connection, so there is nothing to choose from
        until the connection type is known — and it is the connection type's
        own attributes that are offered, not the person's.
      */}
      {edgeSubject !== null && (
        <PromptAttributeField
          name="edgeVariable"
          title="The scale"
          description="Choose the attribute whose ordered values the participant answers on."
          label="Attribute"
          hint="The participant taps one of this attribute's values, and it is recorded on the connection."
          requiredMessage="Choose the attribute the participant answers on."
          subject={edgeSubject}
          types={STRENGTH_TYPES}
          createType="ordinal"
          writerClass="unvalidated"
          createLabel="Create a new attribute"
          editLabel="Change this attribute's values"
          emptyMessage="This connection type has no ordinal attributes yet. Create one to say what the scale is."
          {...(committed === '' ? {} : { committedValue: committed })}
          optionLimit={SCALE_LIMIT}
          optionLimitTitle="More answers than fit on one screen"
          optionLimitDescription="This interface is designed for up to five points on the scale, with the decline answer beside them. Beyond that they become hard to read and hard to tap, which costs data quality."
        />
      )}
      <Section
        title="Answering that there is no connection"
        description="Give the participant a way to say these two people are not connected at all."
      >
        <DialogFormField<typeof RichTextField>
          name="negativeLabel"
          label="Decline answer"
          hint="Shown at the end of the scale. Choosing it records no connection between the pair."
          component={RichTextField}
          singleLine
          placeholder="They don't know each other"
          required="Write how the participant says there is no connection."
        />
      </Section>
    </>
  );
}

export type TieStrengthCensusPromptsSectionProps = Readonly<{
  copy?: Partial<PromptsCopy>;
}>;

/**
 * The questions a Tie-Strength Census asks about every pair of people.
 *
 * Ported from Architect's `TieStrengthCensusPrompts`. Its two inline codebook
 * writes — a thunk that created the connection type and a window that created
 * the attribute — are both compound edits here, so each lands in the codebook
 * whole or not at all and the prompt then points at it as an ordinary unsaved
 * change.
 */
export default function TieStrengthCensusPromptsSection({
  copy,
}: TieStrengthCensusPromptsSectionProps) {
  // The stage's own subject decides which people are paired up, but every one
  // of this prompt's picks describes the connection it creates — so the gate
  // is asked about the row's own edge type rather than about the stage.
  const pickGate = usePromptPickGate({
    picks: PICKS,
    subjectForRow: (row) => edgeSubjectOf(row.createEdge),
  });

  return (
    <PromptsSection
      PromptEditor={TieStrengthCensusPromptEditor}
      PromptPreview={PromptTextPreview}
      editorValidate={pickGate}
      copy={{ ...PROMPTS_COPY, ...copy }}
    />
  );
}
