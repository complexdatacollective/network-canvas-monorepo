import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import type { CrossClassPick } from '../../codebook/variableValidation.ts';
import RichTextField from '../../fields/RichTextField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import PromptsSection, { type PromptsCopy } from '../PromptsSection.tsx';
import type { RowEditorProps } from '../rowRenderers.tsx';
import PromptAttributeField from './PromptAttributeField.tsx';
import {
  usePromptPickGate,
  useSortVariablePool,
  useStageSubject,
} from './promptCodebook.ts';
import { PromptTextField, PromptTextPreview } from './promptText.tsx';
import SortOrderRows from './SortOrderRows.tsx';

/** Only a categorical attribute has the named values this interface bins by. */
const BIN_TYPES: readonly VariableType[] = Object.freeze(['categorical']);

/**
 * The follow-up answer is typed by the participant, so it is stored as text.
 */
const FOLLOW_UP_TYPES: readonly VariableType[] = Object.freeze(['text']);

/**
 * The two picks this prompt makes, and the class of writer each one is.
 *
 * The bins are filled by dragging, which writes the attribute without asking
 * the participant anything a form could validate. The follow-up is typed into
 * an input that honours the attribute's own codebook validation, so it is the
 * opposite class — and the two therefore exclude different attributes.
 */
const PICKS: readonly CrossClassPick[] = Object.freeze([
  { path: 'variable', writerClass: 'unvalidated' },
  { path: 'otherVariable', writerClass: 'validated' },
]);

/** What this interface can show at once before the bins stop being readable. */
const BIN_LIMIT = 8;

const PROMPTS_COPY: Partial<PromptsCopy> = {
  description:
    'Write the questions this stage asks about each person, and drag them into the order the participant answers them.',
  fieldHint:
    'The participant sorts everyone into bins for one question at a time, in this order.',
};

/**
 * What the participant is doing while they answer, said before the researcher
 * writes the question rather than after it.
 */
function CategoricalBinGuidance() {
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        The participant drags each person into one of the bins below, so write a
        question the bins are the answers to — &ldquo;what kind of contact do
        you have with this person?&rdquo; rather than a yes or no question.
      </AlertDescription>
    </Alert>
  );
}

/**
 * One Categorical Bin question: what to ask, which attribute's values become
 * the bins, and what happens to an answer none of them covers.
 */
function CategoricalBinPromptEditor({ item }: RowEditorProps) {
  const subject = useStageSubject();
  const sortableProperties = useSortVariablePool(subject);
  const { variable, otherVariable } = useFormValue([
    'variable',
    'otherVariable',
  ] as const);
  const chosen = typeof variable === 'string' && variable !== '';
  const committed = typeof item.variable === 'string' ? item.variable : '';
  const committedOther =
    typeof item.otherVariable === 'string' ? item.otherVariable : '';
  // Read live rather than from the row: switching the follow-up bin on adds a
  // bin to the screen the researcher is looking at, so the warning about how
  // many bins fit has to answer for it before the prompt is saved.
  const followUpBins =
    typeof otherVariable === 'string' && otherVariable !== '' ? 1 : 0;

  return (
    <>
      <PromptTextField
        guidance={<CategoricalBinGuidance />}
        placeholder="What type of contact do you have most with this person?"
      />
      <PromptAttributeField
        name="variable"
        title="The bins"
        description="Choose the attribute whose values the participant sorts people into."
        label="Attribute"
        hint="Each of this attribute's values becomes a bin, and dropping someone into a bin records that value for them."
        requiredMessage="Choose the attribute whose values become the bins."
        subject={subject}
        types={BIN_TYPES}
        createType="categorical"
        writerClass="unvalidated"
        createLabel="Create a new attribute"
        editLabel="Change this attribute's values"
        emptyMessage="This type has no categorical attributes yet. Create one to say what the bins are."
        {...(committed === '' ? {} : { committedValue: committed })}
        optionLimit={BIN_LIMIT}
        extraCountedOptions={followUpBins}
        optionLimitTitle="More bins than fit on one screen"
        optionLimitDescription="This interface is designed for up to eight bins, including a follow-up bin. Beyond that the bins become hard to read and hard to drop into, which costs data quality. Consider grouping the values and asking for the detail in a later question."
      />
      {/*
        Switching this group off clears all three fields together, which is
        what the protocol schema requires of them: a follow-up attribute with
        no label and no question would be a bin the participant can reach and
        then not be asked anything in.
      */}
      <Section
        title="A bin for anything else"
        description="Add a bin for people none of the values above describe, and ask the participant what to record instead."
        toggleable
        disabled={!chosen}
        defaultOpen={committedOther !== ''}
      >
        <PromptAttributeField
          name="otherVariable"
          label="Attribute the answer is stored in"
          hint="The participant types their own answer, so this is a text attribute."
          requiredMessage="Choose the attribute this bin's answers are stored in."
          subject={subject}
          types={FOLLOW_UP_TYPES}
          createType="text"
          writerClass="validated"
          createLabel="Create a new text attribute"
          editLabel="Edit this attribute"
          emptyMessage="This type has no text attributes yet. Create one to store what the participant types."
          {...(committedOther === '' ? {} : { committedValue: committedOther })}
        />
        <DialogFormField<typeof RichTextField>
          name="otherOptionLabel"
          label="Bin label"
          hint="Shown on the bin itself, so it has to read as somewhere to put a person the other bins do not fit."
          component={RichTextField}
          singleLine
          placeholder="Other"
          required="Name the bin the participant drops everyone else into."
        />
        <DialogFormField<typeof RichTextField>
          name="otherVariablePrompt"
          label="Follow-up question"
          hint="Asked as soon as someone is dropped into this bin."
          component={RichTextField}
          singleLine
          placeholder="What type of contact do you have with this person?"
          required="Write the question this bin asks."
        />
      </Section>
      <SortOrderRows
        name="bucketSortOrder"
        title="Order people are handed to the participant in"
        description="Choose the order the people still to be sorted are offered in."
        label="Rules for handing people over"
        hint="Rules are applied in order. Use the asterisk to keep the order the people were added in."
        addButtonLabel="Add a rule for the order people are handed over in"
        emptyStateMessage="No rules yet, so people are handed over in the order they were added."
        properties={sortableProperties}
        disabled={!chosen}
        committedRules={item.bucketSortOrder}
      />
      <SortOrderRows
        name="binSortOrder"
        title="Order within each bin"
        description="Choose the order people already sorted into a bin are listed in."
        label="Rules for the order within a bin"
        hint="Rules are applied in order. Use the asterisk to keep the order the people were dropped in."
        addButtonLabel="Add a rule for the order within a bin"
        emptyStateMessage="No rules yet, so people are listed in the order they were dropped in."
        properties={sortableProperties}
        disabled={!chosen}
        committedRules={item.binSortOrder}
      />
    </>
  );
}

export type CategoricalBinPromptsSectionProps = Readonly<{
  copy?: Partial<PromptsCopy>;
}>;

/**
 * The questions a Categorical Bin asks, each with the bins it is answered by.
 *
 * Ported from Architect's `CategoricalBinPrompts`. Two things moved: the
 * attribute's values are edited through the codebook rather than through a
 * `variableOptions` key on the prompt — which the protocol schema has never
 * accepted, and which Architect had to strip on the way out — and the pool of
 * attributes comes from the editing session rather than from a Redux
 * selector, so a collaborator's codebook change reaches an open prompt.
 */
export default function CategoricalBinPromptsSection({
  copy,
}: CategoricalBinPromptsSectionProps) {
  const subject = useStageSubject();
  const pickGate = usePromptPickGate({
    picks: PICKS,
    subjectForRow: () => subject,
  });

  return (
    <PromptsSection
      PromptEditor={CategoricalBinPromptEditor}
      PromptPreview={PromptTextPreview}
      editorValidate={pickGate}
      copy={{ ...PROMPTS_COPY, ...copy }}
    />
  );
}
