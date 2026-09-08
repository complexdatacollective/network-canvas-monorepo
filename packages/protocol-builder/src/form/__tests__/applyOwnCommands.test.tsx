import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
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

/**
 * The seam a list editor writes through, exercised directly.
 *
 * A row operation is the only thing that reaches it in the product, but what
 * these tests are about is the seam's own rules — a write the form made itself
 * is not an arrival from elsewhere, an empty batch is a question rather than a
 * write, and a session that has stopped accepting writes takes neither. Going
 * through a list would make each of those a fact about that list.
 */
type ApplyOwnCommands = (commands: readonly Command[]) => OwnCommandsResult;

const NOTHING_APPLIED: OwnCommandsResult = { draft: {}, refused: false };

const initialFields: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
};

function createSession(readOnly = false) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: initialFields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: readOnly
      ? { mode: 'readOnly', reason: 'spectator' }
      : { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Own commands test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

function renderEditor(session: ProtocolBuilderSessionStore) {
  const held: { apply?: ApplyOwnCommands } = {};

  function Probe() {
    held.apply = useStageEditorForm().applyOwnCommands;
    return null;
  }

  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Page content">
          <Probe />
          <ProtocolField
            name="title"
            label="Page heading"
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

  return {
    apply: (commands: readonly Command[]) => {
      let answered: OwnCommandsResult = NOTHING_APPLIED;
      act(() => {
        answered = held.apply!(commands);
      });
      return answered;
    },
    /** The seam as a caller holds it, for driving it inside a wider `act`. */
    raw: (commands: readonly Command[]) => held.apply!(commands),
  };
}

const heading = () => screen.getByRole('textbox', { name: 'Page heading' });

describe('the form’s own structural writes', () => {
  it('refuses one once the stage has stopped accepting writes', async () => {
    const session = createSession(true);
    const { apply } = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    // The session refuses a write it no longer holds the lease for by
    // throwing, which would take the editor down rather than declining the
    // edit. Nothing here writes, so nothing here may throw.
    const answered = apply([
      { op: 'set', key: 'title', value: 'Written anyway' },
    ]);

    expect(answered.draft.title).toBe('Welcome to the study');
    // Answered with the draft it already held, which is indistinguishable from
    // a write that changed nothing — so the refusal is said out loud, for the
    // row dialog whose draft depends on hearing it.
    expect(answered.refused).toBe(true);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(heading()).toHaveValue('Welcome to the study');
  });

  it('reports a stage that was already read-only in the same words as one that becomes it', async () => {
    const session = createSession(true);
    const { apply } = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    apply([{ op: 'set', key: 'title', value: 'Written anyway' }]);

    // The two ways a write is refused for the lease — the stage was already
    // read-only when this handler was built, or the lease went between that
    // render and the dispatch — are the same news about the same form, and a
    // caller cannot be asked to know which of them it met. Answering `refused`
    // and saying nothing is the one that reads as the editor being broken.
    expect(
      await screen.findByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('says so rather than throwing when the lease goes before the write lands', async () => {
    const session = createSession();
    const { raw } = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    let answered: OwnCommandsResult = NOTHING_APPLIED;
    act(() => {
      // The lease is revoked, and a row operation dispatches before React has
      // rendered that: the form still believes it can write, and the session
      // refuses by throwing — out of a click handler, where nothing catches it.
      session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
      answered = raw([
        { op: 'set', key: 'prompts', value: [{ id: 'a', text: 'Who?' }] },
      ]);
    });

    expect(answered.refused).toBe(true);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    // A refusal the researcher can read, in the same words the stage's own
    // submit uses: the lease is what went, and taking editing back is the move.
    expect(
      await screen.findByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('re-seeds the controls when an arrival is folded into its own write', async () => {
    const session = createSession();
    const { raw } = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    act(() => {
      // An authoritative replacement lands, and a list editor commits a row
      // before React has rendered it. The draft the session now holds is both
      // changes at once, and only the row is the form's own.
      session.replaceAuthoritativeStage({
        fields: { label: 'Welcome', title: 'Renamed elsewhere' },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
      raw([{ op: 'set', key: 'prompts', value: [{ id: 'a', text: 'Who?' }] }]);
    });

    // Claiming the combined content as the form's own write suppresses the
    // re-seed the arrival earned, and the control goes on showing — and would
    // save back — the heading the replacement moved away from.
    await waitFor(() => expect(heading()).toHaveValue('Renamed elsewhere'));
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      { id: 'a', text: 'Who?' },
    ]);
  });

  it('leaves everything typed in place when the form writes for itself', async () => {
    const user = userEvent.setup();
    const session = createSession();
    const { apply } = renderEditor(session);

    const control = await screen.findByRole('textbox', {
      name: 'Page heading',
    });
    await user.clear(control);
    await user.type(control, 'Half-written heading');

    apply([{ op: 'set', key: 'prompts', value: [{ id: 'a', text: 'Who?' }] }]);

    // The draft moved, but the form is what moved it. Treating this as an
    // arrival from elsewhere would write the agreed draft back over every
    // control on screen, and this is what would be lost.
    await waitFor(() => expect(heading()).toHaveValue('Half-written heading'));
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      { id: 'a', text: 'Who?' },
    ]);
  });

  it('does not let a read of the draft explain a later arrival', async () => {
    const session = createSession();
    const { apply } = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    // A list editor asking what the session holds right now. It writes
    // nothing, so it has no transition to explain and must leave no record
    // that it did.
    const read = apply([]);
    expect(read.draft.title).toBe('Welcome to the study');
    // A read writes nothing, so there is nothing for the session to refuse.
    expect(read.refused).toBe(false);

    act(() => {
      session.dispatch([{ op: 'set', key: 'title', value: 'Renamed here' }]);
    });
    await waitFor(() => expect(heading()).toHaveValue('Renamed here'));

    act(() => {
      session.undo();
    });

    // The undo returns the draft to exactly the content the read saw. A record
    // left standing by that read would be spent on this arrival, and the
    // control would go on showing what was undone — and save it back over the
    // undo.
    await waitFor(() => expect(heading()).toHaveValue('Welcome to the study'));
  });

  it('does not let a read taken while an arrival lands explain that arrival', async () => {
    const session = createSession();
    const { raw } = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    let read: OwnCommandsResult = NOTHING_APPLIED;
    act(() => {
      // A list editor reading the draft in the same tick an arrival lands: it
      // is answered with the arrival's own content, while the form has not yet
      // re-rendered and still believes the old draft is the agreed one. That
      // gap is the whole reason the read has to leave no record — one taken
      // here describes a write nobody made, and the arrival it names would be
      // waved through as the form's own.
      session.dispatch([{ op: 'set', key: 'title', value: 'Renamed here' }]);
      read = raw([]);
    });

    expect(read.draft.title).toBe('Renamed here');
    await waitFor(() => expect(heading()).toHaveValue('Renamed here'));
  });

  it('does not let a write that changed nothing explain a later arrival', async () => {
    const session = createSession();
    const { apply } = renderEditor(session);
    await screen.findByRole('textbox', { name: 'Page heading' });

    // A row edit that turns out to be identical to what the row already held.
    // It moves nothing, so it has no transition to explain either.
    apply([{ op: 'set', key: 'title', value: 'Welcome to the study' }]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);

    act(() => {
      session.dispatch([{ op: 'set', key: 'title', value: 'Renamed here' }]);
    });
    await waitFor(() => expect(heading()).toHaveValue('Renamed here'));

    act(() => {
      session.undo();
    });

    await waitFor(() => expect(heading()).toHaveValue('Welcome to the study'));
  });
});
