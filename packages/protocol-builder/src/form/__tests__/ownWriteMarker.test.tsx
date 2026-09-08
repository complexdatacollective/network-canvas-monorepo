import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { Command, SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../controller.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import ProtocolField from '../ProtocolField.tsx';
import {
  type OwnCommandsResult,
  useStageEditorForm,
} from '../stageEditorContext.ts';
import StageEditorShell from '../StageEditorShell.tsx';

const OPENED_WITH: SectionDoc = {
  label: 'Welcome',
  title: 'Opening heading',
  interviewScript: 'Original script',
};

function createSession() {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: OPENED_WITH,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    onFinish: () => undefined,
    buildCandidate: ({ stageDocument }) => ({
      name: 'Own write marker test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

/**
 * Two controls, because what the marker gets wrong is a draft that moved for
 * two reasons at once: one field the form itself wrote, and one only the
 * collaborator touched. A single control cannot tell those apart.
 */
function renderEditor(session: ProtocolBuilderSessionStore) {
  const held: { apply?: (commands: readonly Command[]) => OwnCommandsResult } =
    {};

  function Probe() {
    held.apply = useStageEditorForm().applyOwnCommands;
    return null;
  }

  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Page content">
          <Probe />
          <ProtocolField
            name="title"
            label="Page heading"
            component={InputField}
          />
          <ProtocolField
            name="interviewScript"
            label="Interviewer script text"
            component={InputField}
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );

  /** The seam a list editor writes through, for driving inside a wider `act`. */
  return (commands: readonly Command[]) => held.apply!(commands);
}

const heading = () => screen.getByRole('textbox', { name: 'Page heading' });
const script = () =>
  screen.getByRole('textbox', { name: 'Interviewer script text' });

/**
 * An own-write marker the controls never got the chance to spend.
 *
 * The marker names the draft ONE structural write produced, and the only thing
 * that retires it is the form seeing that content arrive. `useSyncExternalStore`
 * hands a render whatever the store holds at render time rather than every
 * value it passed through, so a write and an acknowledgement landing in the
 * same commit are one render showing the COMBINED content — and the write's own
 * content is never seen. Left standing, the marker is spent later on an
 * unrelated arrival that happens to reach that same content, and the re-seed
 * that arrival needed is skipped.
 */
describe('a marker for a write nothing rendered', () => {
  it('re-seeds when a collaborator takes back the change it arrived with', async () => {
    const user = userEvent.setup();
    const session = createSession();
    const apply = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    // One commit: this form's own structural write, and the acknowledgement of
    // it carrying a collaborator's change to a field the write said nothing
    // about. What renders is the two of them together.
    act(() => {
      apply([{ op: 'set', key: 'title', value: 'Written by this form' }]);
      const [batch] = session.getSnapshot().pendingCommands;
      if (batch === undefined) throw new Error('the write dispatched nothing');
      session.acknowledge({
        fields: {
          label: 'Welcome',
          title: 'Written by this form',
          interviewScript: 'Changed by a collaborator',
        },
        throughBatchId: batch.id,
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    await waitFor(() =>
      expect(script()).toHaveValue('Changed by a collaborator'),
    );

    // The collaborator takes that change back. The agreed draft is now, by
    // content, exactly what this form's own write produced — which is the
    // arrival a marker left standing would claim as the form's own doing.
    act(() => {
      session.replaceAuthoritativeStage({
        fields: {
          label: 'Welcome',
          title: 'Written by this form',
          interviewScript: 'Original script',
        },
        manifestRevision: { sequence: 3n, hash: 'revision-3' },
      });
    });

    expect(script()).toHaveValue('Original script');
    expect(heading()).toHaveValue('Written by this form');

    // And the consequence of getting that wrong: an ordinary save writes what
    // the controls are holding, so a control left on the withdrawn value puts
    // it back over the reversion nobody disagreed with.
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.interviewScript).toBe(
        'Original script',
      ),
    );
  });
});
