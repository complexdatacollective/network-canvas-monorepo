import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import type { CrossClassPick } from '../../codebook/variableValidation.ts';
import { OrdinalColorControl } from '../../fields/OrdinalColorField.tsx';
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

/** Only an ordinal attribute has the ordered values this interface bins by. */
const BIN_TYPES: readonly VariableType[] = Object.freeze(['ordinal']);

/**
 * The bins are filled by dragging, which writes the attribute without asking
 * the participant anything a form could validate.
 */
const PICKS: readonly CrossClassPick[] = Object.freeze([
  { path: 'variable', writerClass: 'unvalidated' },
]);

/** What this interface can show at once before the bins stop being readable. */
const BIN_LIMIT = 5;

const PROMPTS_COPY: Partial<PromptsCopy> = {
  description:
    'Write the questions this stage asks about each person, and drag them into the order the participant answers them.',
  fieldHint:
    'The participant sorts everyone into ordered bins for one question at a time, in this order.',
};

function OrdinalBinGuidance() {
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        The participant drags each person into one of a row of bins running from
        least to most, so write a question those bins are the scale of —
        &ldquo;how often do you see this person?&rdquo; rather than a yes or no
        question.
      </AlertDescription>
    </Alert>
  );
}

/**
 * One Ordinal Bin question: what to ask, which attribute's values become the
 * scale, and the colours that scale runs through.
 */
function OrdinalBinPromptEditor({ item }: RowEditorProps) {
  const subject = useStageSubject();
  const sortableProperties = useSortVariablePool(subject);
  const { variable } = useFormValue(['variable'] as const);
  const chosen = typeof variable === 'string' && variable !== '';
  const committed = typeof item.variable === 'string' ? item.variable : '';

  return (
    <>
      <PromptTextField
        guidance={<OrdinalBinGuidance />}
        placeholder="How often do you have contact with this person?"
      />
      <PromptAttributeField
        name="variable"
        title="The scale"
        description="Choose the attribute whose ordered values the participant sorts people into."
        label="Attribute"
        hint="Each of this attribute's values becomes a bin, in the order the attribute lists them."
        requiredMessage="Choose the attribute whose values become the bins."
        subject={subject}
        types={BIN_TYPES}
        createType="ordinal"
        writerClass="unvalidated"
        createLabel="Create a new attribute"
        editLabel="Change this attribute's values"
        emptyMessage="This type has no ordinal attributes yet. Create one to say what the scale is."
        {...(committed === '' ? {} : { committedValue: committed })}
        optionLimit={BIN_LIMIT}
        optionLimitTitle="More bins than fit on one screen"
        optionLimitDescription="This interface is designed for up to five bins. Beyond that the bins become hard to read and hard to drop into, which costs data quality."
      />
      {/*
        The gradient is how the participant reads the scale as a scale, so the
        protocol requires one and there is no unset state to offer.
      */}
      <Section
        title="Colour of the scale"
        description="Choose the gradient the bins run through, from the first value to the last."
      >
        <DialogFormField<typeof OrdinalColorControl>
          name="color"
          label="Colour gradient"
          hint="The bins are shaded along this gradient in the order the attribute lists its values."
          component={OrdinalColorControl}
          required="Choose the gradient the bins are shaded along."
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

export type OrdinalBinPromptsSectionProps = Readonly<{
  copy?: Partial<PromptsCopy>;
}>;

/**
 * The questions an Ordinal Bin asks, each with the scale it is answered on.
 *
 * Ported from Architect's `OrdinalBinPrompts`, with the same two moves as the
 * categorical bin: the attribute's values are edited through the codebook
 * rather than through a `variableOptions` key the schema never accepted, and
 * the pool of attributes comes from the editing session rather than a Redux
 * selector.
 */
export default function OrdinalBinPromptsSection({
  copy,
}: OrdinalBinPromptsSectionProps) {
  const subject = useStageSubject();
  const pickGate = usePromptPickGate({
    picks: PICKS,
    subjectForRow: () => subject,
  });

  /*
    TODO(S itemTemplate): pass
      itemTemplate={() => ({ color: 'ord-color-seq-1' })}
    to `PromptsSection` once it forwards `itemTemplate` to `DialogArrayField`
    — S is adding that passthrough on `feat/protocol-builder-editor-sections`,
    and `DialogArrayField` already takes it.

    Architect seeds a new ordinal prompt with the first swatch of the schema's
    sequence (`OrdinalBinPrompts/OrdinalBinPrompts.tsx`:
    `const template = () => ({ color: 'ord-color-seq-1' })`), so a researcher
    who never looks at the gradient still writes a valid prompt. Here the
    gradient is required and unseeded, so a new prompt is refused until they
    pick one — correct, but a step Architect does not ask for.

    The test that proves the seed is skipped beside the refusal it replaces,
    in `__tests__/OrdinalBinPromptsSection.test.tsx`.
  */

  return (
    <PromptsSection
      PromptEditor={OrdinalBinPromptEditor}
      PromptPreview={PromptTextPreview}
      editorValidate={pickGate}
      copy={{ ...PROMPTS_COPY, ...copy }}
    />
  );
}
