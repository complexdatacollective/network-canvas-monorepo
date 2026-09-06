import { useEffect, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import type { CrossClassPick } from '../../codebook/variableValidation.ts';
import RichTextField from '../../fields/RichTextField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import PromptsSection from '../PromptsSection.tsx';
import type { RowEditorProps } from '../rowRenderers.tsx';
import { censusPromptsMessages } from './censusPromptsMessages.ts';
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

/**
 * What only this family says. The words it shares with the other two censuses,
 * or with the bins, are declared once in `censusPromptsMessages.ts`.
 */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.tieStrengthGuidance',
    defaultMessage:
      'The participant sees two people side by side and answers on a scale, so write the question about the pair in front of them — “how close are these two people?” rather than a name — and phrase it so that every point on the scale is a sensible answer.',
    description:
      'Guidance shown above the box where a researcher writes a Tie-Strength Census prompt, saying what the participant is looking at while they answer it. The quoted sentence is an example of a question a scale can answer.',
  },
  placeholder: {
    id: 'protocolBuilder.censusPrompts.tieStrengthPlaceholder',
    defaultMessage: 'How close are these two people?',
    description:
      'Example question in the empty box where a researcher writes a Tie-Strength Census prompt.',
  },
  edgeDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeDescription',
    defaultMessage:
      'Choose the kind of connection an answer on the scale records between the pair.',
    description:
      'Description of the group that says what answering on the scale records between the two people a Tie-Strength Census prompt asked about.',
  },
  edgeHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeHint',
    defaultMessage:
      'A connection of this type is created between the two people whenever the participant answers on the scale.',
    description:
      'Guidance under the control that picks what answering on the scale records between the two people a Tie-Strength Census prompt asked about.',
  },
  edgeRequired: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeRequired',
    defaultMessage: 'Choose the type of connection this prompt creates.',
    description:
      'Refusal shown when a researcher saves a Tie-Strength Census prompt without saying what an answer on the scale records.',
  },
  scaleDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleDescription',
    defaultMessage:
      'Choose the attribute whose ordered values the participant answers on.',
    description:
      'Description of the group that picks the attribute whose ordered values are the points of the scale. The attribute belongs to the connection this prompt creates, not to either person.',
  },
  scaleHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleHint',
    defaultMessage:
      "The participant taps one of this attribute's values, and it is recorded on the connection.",
    description:
      'Guidance under the attribute picker in a Tie-Strength Census prompt, saying where the participant’s answer is stored.',
  },
  scaleRequired: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleRequired',
    defaultMessage: 'Choose the attribute the participant answers on.',
    description:
      'Refusal shown when a researcher saves a Tie-Strength Census prompt without saying which attribute holds the strength.',
  },
  scaleEmpty: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleEmpty',
    defaultMessage:
      'This connection type has no ordinal attributes yet. Create one to say what the scale is.',
    description:
      'Shown in place of the attribute picker’s options when the kind of connection this prompt creates has no attribute whose answers run in an order.',
  },
  scaleLimitTitle: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleLimitTitle',
    defaultMessage: 'More answers than fit on one screen',
    description:
      'Heading of the warning shown when the attribute a Tie-Strength Census prompt uses offers more values than the interview screen can draw as points on its scale.',
  },
  scaleLimitDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleLimitDescription',
    defaultMessage:
      'This interface is designed for up to five points on the scale, with the decline answer beside them. Beyond that they become hard to read and hard to tap, which costs data quality.',
    description:
      'Body of the warning shown when a Tie-Strength Census prompt would draw more points on its scale than its interview screen is designed for. The decline answer is the extra control the participant uses to say the two people are not connected.',
  },
  declineTitle: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineTitle',
    defaultMessage: 'Answering that there is no connection',
    description:
      'Heading of the group holding the words the participant chooses to say the two people in front of them are not connected.',
  },
  declineDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineDescription',
    defaultMessage:
      'Give the participant a way to say these two people are not connected at all.',
    description:
      'Description of the group holding the words the participant chooses to say the two people in front of them are not connected.',
  },
  declineLabel: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineLabel',
    defaultMessage: 'Decline answer',
    description:
      'Label of the box a researcher writes the words the participant chooses to say the two people are not connected.',
  },
  declineHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineHint',
    defaultMessage:
      'Shown at the end of the scale. Choosing it records no connection between the pair.',
    description:
      'Guidance under the box a researcher writes the decline answer into, saying where the participant sees it and what choosing it does.',
  },
  declinePlaceholder: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclinePlaceholder',
    defaultMessage: "They don't know each other",
    description:
      'Example wording in the empty box where a researcher writes the decline answer.',
  },
  declineRequired: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineRequired',
    defaultMessage: 'Write how the participant says there is no connection.',
    description:
      'Refusal shown when a researcher saves a Tie-Strength Census prompt without wording for the decline answer.',
  },
});

function TieStrengthGuidance() {
  const intl = useAppIntl();
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        {intl.formatMessage(messages.guidance)}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Throws away the scale when the connection it describes changes.
 *
 * `edgeVariable` names an attribute OF `createEdge`, so a prompt that keeps
 * its scale across a change of connection type names an attribute the new type
 * does not have. Nothing downstream can rescue that: the picker keeps the
 * current pick on offer so that reopening a prompt never loses it, and it can
 * only report the stale one as no longer in the codebook — which is not what
 * happened, the attribute is still there on the connection type the researcher
 * just moved away from. The prompt is then accepted by its own dialog and
 * refused by the stage save, in the schema's words about a codebook the
 * researcher is not looking at.
 *
 * The same rule the subject section applies one level up, where changing what
 * a stage is about throws away everything that described the old subject
 * (`useResetStageOnSubjectChange`) — and an observer effect for the same
 * reason: a caller's `onChange` on a Fresco field REPLACES the store's own
 * write rather than running beside it.
 *
 * The connection type ARRIVING is not a change of connection type. A prompt
 * opened on a saved row and a brand-new one both begin with nothing here, and
 * clearing on that first value would throw the saved scale away the moment the
 * researcher opened the prompt to read it.
 */
function useClearScaleOnConnectionChange(createEdge: unknown): void {
  const clearValue = useFormStore((state) => state.clearValue);
  const seenEdge = useRef(createEdge);

  useEffect(() => {
    const previousEdge = seenEdge.current;
    seenEdge.current = createEdge;
    if (
      previousEdge === undefined ||
      previousEdge === '' ||
      previousEdge === createEdge
    ) {
      return;
    }
    clearValue('edgeVariable');
  }, [clearValue, createEdge]);
}

/**
 * One Tie-Strength Census question: what to ask, what an answer connects, how
 * strong that connection is said to be, and how the participant says there is
 * none.
 */
function TieStrengthCensusPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const { createEdge } = useFormValue(['createEdge'] as const);
  const edgeSubject = edgeSubjectOf(createEdge);
  const committed =
    typeof item.edgeVariable === 'string' ? item.edgeVariable : '';

  useClearScaleOnConnectionChange(createEdge);

  return (
    <>
      <PromptTextField
        guidance={<TieStrengthGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
      <CreateEdgeField
        title={intl.formatMessage(censusPromptsMessages.edgeLabel)}
        description={intl.formatMessage(messages.edgeDescription)}
        label={intl.formatMessage(censusPromptsMessages.edgeLabel)}
        hint={intl.formatMessage(messages.edgeHint)}
        requiredMessage={intl.formatMessage(messages.edgeRequired)}
        createLabel={intl.formatMessage(censusPromptsMessages.edgeCreateLabel)}
        createDescription={intl.formatMessage(
          censusPromptsMessages.edgeCreateDescription,
        )}
      />
      {/*
        The scale belongs to the connection, so there is nothing to choose from
        until the connection type is known — and it is the connection type's
        own attributes that are offered, not the person's.
      */}
      {edgeSubject !== null && (
        <PromptAttributeField
          name="edgeVariable"
          title={intl.formatMessage(censusPromptsMessages.scaleTitle)}
          description={intl.formatMessage(messages.scaleDescription)}
          label={intl.formatMessage(censusPromptsMessages.attributeLabel)}
          hint={intl.formatMessage(messages.scaleHint)}
          requiredMessage={intl.formatMessage(messages.scaleRequired)}
          subject={edgeSubject}
          types={STRENGTH_TYPES}
          createType="ordinal"
          writerClass="unvalidated"
          createLabel={intl.formatMessage(
            censusPromptsMessages.attributeCreateLabel,
          )}
          editLabel={intl.formatMessage(
            censusPromptsMessages.attributeEditLabel,
          )}
          emptyMessage={intl.formatMessage(messages.scaleEmpty)}
          {...(committed === '' ? {} : { committedValue: committed })}
          optionLimit={SCALE_LIMIT}
          optionLimitTitle={intl.formatMessage(messages.scaleLimitTitle)}
          optionLimitDescription={intl.formatMessage(
            messages.scaleLimitDescription,
          )}
        />
      )}
      <Section
        title={intl.formatMessage(messages.declineTitle)}
        description={intl.formatMessage(messages.declineDescription)}
      >
        <DialogFormField<typeof RichTextField>
          name="negativeLabel"
          label={intl.formatMessage(messages.declineLabel)}
          hint={intl.formatMessage(messages.declineHint)}
          component={RichTextField}
          singleLine
          placeholder={intl.formatMessage(messages.declinePlaceholder)}
          required={intl.formatMessage(messages.declineRequired)}
        />
      </Section>
    </>
  );
}

/**
 * The questions a Tie-Strength Census asks about every pair of people.
 *
 * Ported from Architect's `TieStrengthCensusPrompts`. Its two inline codebook
 * writes — a thunk that created the connection type and a window that created
 * the attribute — are both compound edits here, so each lands in the codebook
 * whole or not at all and the prompt then points at it as an ordinary unsaved
 * change.
 */
export default function TieStrengthCensusPromptsSection() {
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
      description={censusPromptsMessages.pairDescription}
      fieldHint={censusPromptsMessages.pairFieldHint}
    />
  );
}
