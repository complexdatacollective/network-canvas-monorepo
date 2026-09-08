import { act, screen, waitFor } from '@testing-library/react';
import { isEqual } from 'es-toolkit/compat';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import BuilderSection from '../BuilderSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
import { changeSubjectTo } from './changeSubject.ts';
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

    await changeSubjectTo(harness.user, 'family member');

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

    await changeSubjectTo(harness.user, 'family member');

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

    await changeSubjectTo(harness.user, 'family member');
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

/**
 * A key the form is PARKING is in neither of the two places the reset used to
 * read.
 *
 * `getFormValues()` is built from registered fields, so a control the
 * researcher answered and then unmounted contributes nothing; and an answer
 * that has not been saved has never reached the committed draft. The
 * submission replays parked values on purpose — without that, a value hidden
 * behind a collapsed group would look identical to one deliberately thrown
 * away — so a key that escapes the reset is written into the saved stage
 * alongside the NEW subject: configuration describing a type the stage no
 * longer collects.
 */
describe('resetting a key the form is holding parked', () => {
  /**
   * Stands in for any family control whose presence depends on another
   * control's value — the content block editor's per-kind slots are that
   * pattern one store down.
   */
  function ParkableSection() {
    const [mounted, setMounted] = useState(true);
    return (
      <BuilderSection title="Existing nodes" description="A parkable field.">
        <button type="button" onClick={() => setMounted((on) => !on)}>
          Toggle the field
        </button>
        {mounted && (
          <ProtocolField<typeof ToggleField>
            name="showExistingNodes"
            component={ToggleField}
            label="Show existing nodes"
          />
        )}
      </BuilderSection>
    );
  }

  it('throws away a value whose control has since unmounted', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: (
        <>
          {nodeSubjectAndPrompts}
          <ParkableSection />
        </>
      ),
      applyLive: true,
    });

    // 1. The researcher answers the parkable field…
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Show existing nodes' }),
    );
    // 2. …and it unmounts, so the store parks what they answered.
    await harness.user.click(
      screen.getByRole('button', { name: 'Toggle the field' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('switch', { name: 'Show existing nodes' }),
      ).not.toBeInTheDocument(),
    );

    // 3. The researcher changes what the stage collects.
    await changeSubjectTo(harness.user, 'family member');
    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields.subject,
      ).toEqual({ entity: 'node', type: 'family_member' }),
    );

    // The reset reached the parked key, in the same batch as the subject.
    expect(harness.liveCommands()).toContainEqual({
      op: 'unset',
      key: 'showExistingNodes',
    });

    // The reset took the prompts with it, so the stage needs one again to get
    // as far as being judged against the schema at all.
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who in your family?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // And end to end: what the save carries no longer mentions it. A name
    // generator that has lost its `form` to the same reset cannot be saved,
    // so the save produces a refusal — and the refusal is where the surviving
    // key showed up, named against a schema that has never heard of it. The
    // wait is on that refusal, so this cannot pass by never getting there.
    await harness.submit();
    await screen.findByText(/expected object, received undefined/u);
    expect(document.body.textContent).not.toContain('showExistingNodes');
  });
});

/**
 * Editing taken away between the researcher's pick and the effect that acts on
 * it.
 *
 * The window is a render wide by design: the pick writes a form value, and the
 * reset is an OBSERVER of that value (`useOnResearcherChange`) rather than the
 * control's own handler, so the two are a commit apart. A lease lost in
 * between leaves the session refusing the batch — and a form emptied anyway
 * throws away a configuration the session still holds, with nothing left on
 * screen to fill it back in.
 */
describe('a subject change the session refuses', () => {
  /**
   * The pick, made the way the section's own create-a-type path makes it.
   *
   * `selectCreatedType` writes the subject straight into the form store — from
   * a promise continuation, where a lease lost in the same commit is exactly
   * this window — so this is the product's own write rather than a seam
   * invented for the test. A radio click cannot express it: `fireEvent` flushes
   * React's effects before the next line runs, so the reset would have landed,
   * and the revocation would then be an ordinary rollback of it.
   */
  const pickTheOtherType = { current: (): void => undefined };

  function SubjectPickProbe() {
    const { storeApi } = useStageEditorForm();
    pickTheOtherType.current = () => {
      storeApi
        .getState()
        .setFieldValue('subject', { entity: 'node', type: 'family_member' });
    };
    return null;
  }

  /** The type the stage has, and the one the picker is put back to. */
  const PERSON = { entity: 'node', type: 'person' };

  /**
   * Editing to hand back the moment the picker goes back, or `null` for the
   * tests that do not want it.
   *
   * Armed by one test. A form-store SUBSCRIBER, because that is where the gap
   * being described is: the restore is a store write, and its subscribers run
   * during it — before React has re-rendered, and before the effect that reads
   * the value back has run.
   */
  const handBackEditing = { current: null as (() => void) | null };

  function HandBackWhenThePickerGoesBack() {
    const { storeApi } = useStageEditorForm();
    useEffect(
      () =>
        storeApi.subscribe(() => {
          const handBack = handBackEditing.current;
          if (handBack === null) return;
          if (!isEqual(storeApi.getState().getFormValues().subject, PERSON)) {
            return;
          }
          handBackEditing.current = null;
          handBack();
        }),
      [storeApi],
    );
    return null;
  }

  const sections = (
    <>
      <SubjectPickProbe />
      <HandBackWhenThePickerGoesBack />
      {nodeSubjectAndPrompts}
    </>
  );

  // Disarmed for everything that has not asked for it, so a test that never
  // reaches the gap cannot leave the hand-back armed for the next one.
  beforeEach(() => {
    handBackEditing.current = null;
  });

  const READ_ONLY_MESSAGE =
    'This stage is read-only, so your changes were not saved. Take over editing and try again.';

  /** The pick and the revocation in one commit, which is the whole window. */
  const pickWhileEditingIsTaken = (harness: StageEditorHarness) => {
    act(() => {
      pickTheOtherType.current();
      harness.session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });
  };

  it('leaves the configuration where the researcher can still see and save it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections,
    });
    await screen.findByText('Who are the people you know?');

    pickWhileEditingIsTaken(harness);

    // The batch reached the session and was refused there, which is said out
    // loud in the form's own error region.
    await screen.findByText(READ_ONLY_MESSAGE);
    const { fields } = harness.session.getSnapshot().editedSection;
    expect(fields.subject).toEqual({ entity: 'node', type: 'person' });
    expect(fields.prompts).toHaveLength(1);
    expect(harness.pendingCommands()).toEqual([]);

    // Nothing was thrown away, so nothing may be emptied either: the session's
    // copy is the only one there is, and a form cleared here would leave the
    // stage looking unconfigured with nothing left to fill it back in.
    //
    // The PICK goes back with it. The refusal was of the whole batch, the
    // subject included, so a picker left showing the new type would be the
    // only part of the stage saying the change happened — and would say it
    // about a change nothing else on screen or in the session agrees with.
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'person' })).toBeChecked(),
    );
    expect(
      screen.getByRole('radio', { name: 'family member' }),
    ).not.toBeChecked();

    // Editing is handed back and the stage saved before the configuration is
    // read, because a prompt removed from the list leaves the document a frame
    // later — the save is a round of work the removal would have finished
    // inside. What comes back is the stage the researcher had: the type the
    // session held all along, and the prompt that describes it.
    harness.setReadOnly(false);
    const request = await harness.submit();
    expect(request?.stageDocument.subject).toEqual({
      entity: 'node',
      type: 'person',
    });
    expect(request?.stageDocument.prompts).toHaveLength(1);
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit prompt' })).toHaveLength(
      1,
    );
  });

  /**
   * The refusal is about that one write and nothing else. Editing handed back
   * has to leave the reset exactly as armed as it was, or the researcher's
   * next choice of type keeps the previous one's configuration for good.
   */
  it('resets once the researcher picks the new type again', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections,
    });
    await screen.findByText('Who are the people you know?');

    pickWhileEditingIsTaken(harness);
    await screen.findByText(READ_ONLY_MESSAGE);
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'person' })).toBeChecked(),
    );

    // The whole gesture again, the question included: the picker is back where
    // it was, so the change is one the researcher can make — and the stage is
    // still configured, so it still costs them something and is still asked
    // about. `changeSubjectTo` waits for that question, so a change that went
    // through unasked would never get past it.
    harness.setReadOnly(false);
    await changeSubjectTo(harness.user, 'family member');

    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );
    const { fields } = harness.session.getSnapshot().editedSection;
    expect(fields.subject).toEqual({ entity: 'node', type: 'family_member' });
    expect(fields).not.toHaveProperty('prompts');
    // ONCE. The refused batch left nothing behind, and putting the picker back
    // is not a change of its own — a second reset would be one the researcher
    // never asked for, and would carry a second entry in the session's history
    // for an undo to walk back through.
    expect(harness.pendingCommands()).toHaveLength(1);
  });

  /**
   * The other half of the same fact: a researcher who stays with the type the
   * stage has keeps everything that describes it.
   *
   * This was the failure the picker being left on the rejected type created.
   * With it showing a type the stage does not have, choosing the type it DOES
   * have is a change like any other, and the reset threw away the very
   * configuration that belonged to it.
   */
  it('leaves the stage alone when the researcher keeps the type it has', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections,
    });
    await screen.findByText('Who are the people you know?');

    pickWhileEditingIsTaken(harness);
    await screen.findByText(READ_ONLY_MESSAGE);
    harness.setReadOnly(false);

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    // Nothing is asked, because nothing is being changed: the picker already
    // shows this type.
    expect(
      screen.queryByRole('button', { name: 'Change the node type' }),
    ).not.toBeInTheDocument();

    // And the save is the settling round behind that: a question raised a tick
    // later would still be open here, and a stage whose subject and form
    // disagree cannot be saved at all. What comes back is untouched.
    const request = await harness.submit();
    expect(request?.stageDocument.subject).toEqual({
      entity: 'node',
      type: 'person',
    });
    expect(request?.stageDocument.prompts).toHaveLength(1);
  });

  /**
   * Editing handed back inside the window the restore itself opens.
   *
   * Putting the picker back moves the value the reset watches, and the effect
   * that reads it is a commit later — the same render-wide window the refusal
   * lives in, seen from the other side. A lease that returns in that gap makes
   * the restored subject a write the session would now accept, and taking it
   * would throw away the configuration belonging to the type the picker was
   * just put back to: the refused change carried out after all, against a
   * stage that never changed.
   */
  it('does not read the picker going back as a choice of its own', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections,
    });
    await screen.findByText('Who are the people you know?');

    act(() => {
      handBackEditing.current = () => {
        harness.setReadOnly(false);
      };
      pickTheOtherType.current();
      harness.session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });
    // The gap was reached: the picker went back, and editing was handed over
    // while it did.
    expect(handBackEditing.current).toBeNull();

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'person' })).toBeChecked(),
    );
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
    const { fields } = harness.session.getSnapshot().editedSection;
    expect(fields.subject).toEqual({ entity: 'node', type: 'person' });
    expect(fields.prompts).toHaveLength(1);
    expect(harness.pendingCommands()).toEqual([]);
  });
});
