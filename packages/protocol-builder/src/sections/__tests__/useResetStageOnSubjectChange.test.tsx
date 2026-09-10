import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { DialogFormField } from '../../form/DialogForm.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import BuilderSection from '../BuilderSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import type { RowPreviewProps } from '../rowRenderers.tsx';
import SubjectSection from '../SubjectSection.tsx';
import { changeSubjectTo } from './changeSubject.ts';

/**
 * A family's own section for one nested behaviour.
 *
 * Registers the LEAF (`behaviours.removeAfterConsideration`) rather than the
 * container, which is what every real behaviours section does — the schema
 * holds several unrelated switches in one object, and a control per switch is
 * the only way to render them.
 */
function RemoveAfterConsiderationSection() {
  return (
    <BuilderSection title="Behaviours" description="How this task behaves.">
      <ProtocolField<typeof ToggleField>
        name="behaviours.removeAfterConsideration"
        component={ToggleField}
        label="Remove alters after they have been considered"
      />
    </BuilderSection>
  );
}

/**
 * A census prompt, which is a question and the edge answering it records.
 *
 * The edge is written by a control of its own with a starting value, because
 * a census prompt that names no edge is one the schema refuses — and what
 * these tests are about is the stage being saveable again once the researcher
 * has replaced the prompts the subject change threw away.
 */
function CensusPromptEditor() {
  return (
    <>
      <DialogFormField
        name="text"
        label="Prompt text"
        component={InputField}
        required="Enter the question this prompt asks."
      />
      <DialogFormField
        name="createEdge"
        label="Edge type"
        component={InputField}
        initialValue="knows"
      />
    </>
  );
}

function CensusPromptPreview({ item }: RowPreviewProps) {
  return (
    <span>{typeof item.text === 'string' ? item.text : 'Empty prompt'}</span>
  );
}

const subjectAndPrompts = (
  <>
    <SubjectSection entity="node" />
    <PromptsSection
      PromptEditor={CensusPromptEditor}
      PromptPreview={CensusPromptPreview}
    />
  </>
);

/** Writes one whole question, then the edge its answers record. */
const writeAPrompt = async (
  user: ReturnType<typeof renderStageEditor>['user'],
  question: string,
) => {
  await user.click(screen.getByRole('button', { name: 'Create new prompt' }));
  await user.type(
    await screen.findByRole('textbox', { name: 'Prompt text' }),
    question,
  );
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
};

/**
 * A stage whose interface has a nested default, holding the opposite of it —
 * so a reset back to the template is visible, which the fixture's own stage
 * (already holding the default) could never be.
 */
const censusHoldingNonDefault = {
  id: 'one-to-many-dyad-census-1',
  type: 'OneToManyDyadCensus' as const,
  fields: {
    label: 'One to Many Dyad Census',
    subject: { entity: 'node', type: 'person' },
    behaviours: { removeAfterConsideration: false },
    prompts: [
      {
        id: 'one-to-many-dyad-census-prompt-1',
        text: 'Tap on all the people who this person knows',
        createEdge: 'knows',
      },
    ],
  },
};

describe('resetting a stage whose interface has nested defaults', () => {
  /**
   * A section registers the LEAVES of a container it configures, and the store
   * keys fields by exact name. Writing the container alone parks a value at
   * `behaviours` that never reaches the control registered at
   * `behaviours.removeAfterConsideration`, so the switch would go on showing
   * the previous type's setting while the stage claimed otherwise.
   */
  it('writes each nested default under the name its own control registered', async () => {
    const harness = renderStageEditor({
      stage: censusHoldingNonDefault,
      sections: (
        <>
          <SubjectSection entity="node" />
          <RemoveAfterConsiderationSection />
        </>
      ),
    });

    const toggle = await screen.findByRole('switch', {
      name: 'Remove alters after they have been considered',
    });
    expect(toggle).not.toBeChecked();

    await changeSubjectTo(harness.user, 'family member');

    await waitFor(() => expect(toggle).toBeChecked());
  });
});

/**
 * A filter naming the type the stage collects.
 *
 * Everything about it belongs to `person`: kept across a change of subject it
 * would leave the saved stage filtering the new type by a rule written about
 * the old one.
 */
const A_PERSON_FILTER: SectionDoc = {
  rules: [
    {
      id: 'rule-1',
      type: 'node',
      options: { type: 'person', operator: 'EXISTS' },
    },
  ],
};

const censusWithAFilter = {
  id: 'dyad-census-1',
  type: 'DyadCensus' as const,
  fields: {
    label: 'Dyad Census',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: {
      title: 'Introduction to the Dyad Census',
      text: 'This section goes through every pair of people.',
    },
    filter: A_PERSON_FILTER,
    prompts: [
      {
        id: 'dyad-census-prompt-1',
        text: 'Do these two people know each other?',
        createEdge: 'knows',
      },
    ],
  },
};

describe('resetting a key the researcher has never looked at', () => {
  /**
   * A stage editor with no section for one of its interface's keys still
   * carries that key, and it still describes the old type. Reading only the
   * form's own values would leave it in the saved stage — a census pointed at
   * a new type, still filtered by a rule about the old one through a control
   * nothing on screen mentions.
   */
  it('throws away a key nothing on screen renders', async () => {
    const harness = renderStageEditor({
      stage: censusWithAFilter,
      sections: subjectAndPrompts,
    });
    await screen.findByText('Do these two people know each other?');
    // Nothing mounted here renders `filter`, so it is in the stage document
    // and nowhere else.
    expect(harness.ownedKeys()).not.toContain('filter');

    await changeSubjectTo(harness.user, 'family member');

    // The reset took the prompts with it, so the stage needs one again before
    // the schema will let it be saved at all.
    await writeAPrompt(harness.user, 'Are these two people related?');
    const written = await harness.submit();

    expect(written?.stageDocument).toMatchObject({
      subject: { entity: 'node', type: 'family_member' },
    });
    expect(written?.stageDocument).not.toHaveProperty('filter');
  });
});

/**
 * A key the form is PARKING is in neither of the two places a reset would
 * otherwise look.
 *
 * The form's own values are built from registered fields, so a control the
 * researcher answered and then unmounted contributes nothing; and the document
 * the editor opened on never held the answer at all. The submission replays
 * parked values on purpose — without that, a value hidden behind a collapsed
 * group would look identical to one deliberately thrown away — so a key that
 * escapes the reset is written into the saved stage alongside the NEW subject:
 * configuration describing a type the stage no longer collects.
 */
describe('resetting a key the form is holding parked', () => {
  /** Writes a whole filter in one go, the way a rule editor commits one. */
  function FilterPicker({
    id,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    value?: FieldValue;
    onChange: (value: FieldValue) => void;
  }>) {
    return (
      <button
        type="button"
        id={id}
        onClick={() => {
          onChange(A_PERSON_FILTER);
        }}
      >
        {value === undefined ? 'Choose' : 'Choose again'}
      </button>
    );
  }

  /**
   * Stands in for any control whose presence depends on another control's
   * value — a content block editor's per-kind slots are that pattern one store
   * down.
   */
  function ParkableFilterSection() {
    const [mounted, setMounted] = useState(true);
    return (
      <BuilderSection title="Who this asks about" description="A filter.">
        <button type="button" onClick={() => setMounted((on) => !on)}>
          Toggle the field
        </button>
        {mounted && (
          <ProtocolField<typeof FilterPicker>
            name="filter"
            label="Only some people"
            component={FilterPicker}
          />
        )}
      </BuilderSection>
    );
  }

  it('throws away a value whose control has since unmounted', async () => {
    const harness = renderStageEditor({
      stage: {
        ...censusWithAFilter,
        fields: withoutFilter(censusWithAFilter.fields),
      },
      sections: (
        <>
          {subjectAndPrompts}
          <ParkableFilterSection />
        </>
      ),
    });

    // 1. The researcher answers the parkable field…
    await harness.user.click(
      await screen.findByRole('button', { name: 'Only some people' }),
    );
    // 2. …and it unmounts, so the store parks what they answered.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle the field' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Only some people' }),
      ).not.toBeInTheDocument(),
    );

    // 3. The researcher changes what the stage collects.
    await changeSubjectTo(harness.user, 'family member');

    await writeAPrompt(harness.user, 'Are these two people related?');
    const written = await harness.submit();

    expect(written?.stageDocument).toMatchObject({
      subject: { entity: 'node', type: 'family_member' },
    });
    expect(written?.stageDocument).not.toHaveProperty('filter');
  });
});

function withoutFilter(fields: SectionDoc): SectionDoc {
  const { filter: _filter, ...rest } = fields;
  return rest;
}
