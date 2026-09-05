import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

import ProtocolField from '../../form/ProtocolField.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import BuilderSection from '../BuilderSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
import { TestPromptEditor, TestPromptPreview } from './rowFixtures.tsx';

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

const nodeSubjectAndPrompts = (
  <>
    <SubjectSection entity="node" />
    <PromptsSection
      PromptEditor={TestPromptEditor}
      PromptPreview={TestPromptPreview}
    />
  </>
);

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
   * the previous type's setting while the draft claimed otherwise.
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

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    await waitFor(() => expect(toggle).toBeChecked());
  });
});

describe('resetting a key the researcher has never looked at', () => {
  /**
   * A stage editor that has no section for one of its interface's keys still
   * carries that key in the agreed draft, and it still describes the old type.
   * Reading only the form's own values would leave it in the saved stage — a
   * name generator pointed at a new type, still creating the old one's nodes
   * through a form nothing on screen mentions.
   */
  it('throws away a key only the committed draft knows about', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    // Nothing mounted here renders `form`, so it is in the committed draft and
    // nowhere else.
    expect(harness.ownedKeys()).not.toContain('form');
    expect(harness.session.getSnapshot().editedSection.fields).toHaveProperty(
      'form',
    );

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields,
      ).not.toHaveProperty('form'),
    );
  });

  /**
   * A key with no template default is simply GONE: absence is how the schema
   * spells "this stage does not do this", and the clear has already said so.
   * Writing `undefined` over it again parks a tombstone the form has no
   * control for — which then outlives the reset and deletes the key again the
   * next time the stage is saved, undoing an undo that had restored it.
   */
  it('leaves no tombstone behind a key with no default to return to', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );
    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields,
      ).not.toHaveProperty('form'),
    );

    act(() => {
      harness.session.undo();
    });
    await screen.findByText('Who are the people you know?');

    // The undo put `form` back, and saving must not take it away again.
    const request = await harness.submit();
    expect(request?.stageDocument.form).toEqual({
      title: 'Add a person',
      fields: [{ variable: 'name', prompt: "What is this person's name?" }],
    });
  });
});
