import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import ProtocolField from '../../form/ProtocolField.tsx';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import { InMemoryResourceGateway } from '../../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  type PendingCommandBatch,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import { fixtureMessage } from '../../testing/i18n.ts';
import BuilderSection from '../BuilderSection.tsx';
import { useOnResearcherChange } from '../researcherChange.ts';

const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });

/** A roster with someone in it: an empty one is a file the gateway refuses. */
const ROSTER_BYTES = new TextEncoder().encode(
  JSON.stringify({ nodes: [{ attributes: { name: 'Ada' } }], edges: [] }),
);

/**
 * A roster stage whose card details were configured against a data file the
 * stage no longer names.
 *
 * The prerequisite starts ABSENT, which is the case this file is about: the
 * researcher's first choice of file is a change like any other, and the
 * details describing the file that is gone are exactly what it invalidates.
 */
const rosterFields: SectionDoc = {
  label: 'People you know',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'prompt-1', text: 'Pick someone you know' }],
  behaviours: {},
  cardOptions: {
    additionalProperties: [{ label: 'Nickname', variable: 'nickname' }],
  },
};

const protocolSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Researcher change', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: {
    id: 'stage-1',
    type: 'NameGeneratorRoster',
    ...rosterFields,
  },
};

function createSession(
  options: Readonly<{
    onCommands?: (batch: PendingCommandBatch) => void;
    resourceGateway?: InMemoryResourceGateway;
  }> = {},
) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('NameGeneratorRoster', () => 'stage-1'),
    fields: rosterFields,
    protocolSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    ...(options.onCommands === undefined
      ? {}
      : { onCommands: options.onCommands }),
    ...(options.resourceGateway === undefined
      ? {}
      : { resourceGateway: options.resourceGateway }),
    buildCandidate: ({ stageDocument }) => ({
      name: 'Researcher change',
      schemaVersion: 8,
      codebook: {
        node: { person: { name: 'Person', color: 'node-color-seq-1' } },
      },
      stages: [stageDocument],
    }),
  });
}

/**
 * A control that writes its whole value in one go, the way a file picker does.
 *
 * A text input would be no use here: typing a name is a transition per
 * keystroke, so the first one being swallowed would be hidden by the second.
 * What a researcher does to a data file is choose one, once.
 */
function RosterFilePicker({
  id,
  value,
  onChange,
  picks,
}: Readonly<{
  id?: string;
  value?: FieldValue;
  onChange: (value: FieldValue) => void;
  picks: string;
}>) {
  return (
    <button
      type="button"
      id={id}
      onClick={() => {
        onChange(picks);
      }}
    >
      {typeof value === 'string' && value !== ''
        ? 'Choose a different roster file'
        : 'Choose a roster file'}
    </button>
  );
}

/**
 * The control's own name is its field's label: a `button` is labelable, so the
 * label `BaseField` renders for it wins over its content.
 */
const pickTheRosterFile = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Roster file' }));
};

const cardOptionsCapability = {
  fields: ['cardOptions'],
  confirmClear: {
    title: fixtureMessage('This will clear the card details'),
    description: fixtureMessage('The columns you chose will be removed.'),
    confirmLabel: fixtureMessage('Clear card details'),
  },
} as const;

/** Records what the section watching `dataSource` is told, and nothing else. */
function ChangeProbe({
  onResearcherChange,
}: Readonly<{ onResearcherChange: (value: unknown) => void }>) {
  useOnResearcherChange('dataSource', onResearcherChange);
  return null;
}

function renderProbeEditor(
  session: ProtocolBuilderSessionStore,
  onResearcherChange: (value: unknown) => void,
  picks: string,
) {
  function Editor() {
    const controller = useStageEditorController(session, 'stage-form');

    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Roster file">
          <ProtocolField
            name="dataSource"
            label="Roster file"
            component={RosterFilePicker}
            picks={picks}
          />
          <ChangeProbe onResearcherChange={onResearcherChange} />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <Editor />
    </DialogProvider>,
  );
}

function renderRosterEditor(
  session: ProtocolBuilderSessionStore,
  picks: string,
) {
  function Editor() {
    const controller = useStageEditorController(session, 'stage-form');

    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Roster file">
          <ProtocolField
            name="dataSource"
            label="Roster file"
            component={RosterFilePicker}
            picks={picks}
          />
        </BuilderSection>
        <BuilderSection
          title="Card details"
          capability={cardOptionsCapability}
          resetOn="dataSource"
        >
          <p>Which columns of the roster the cards show.</p>
        </BuilderSection>
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <Editor />
    </DialogProvider>,
  );
}

/**
 * What the researcher did, told apart from what happened to them.
 *
 * Only the FIRST OBSERVATION is not a change: nothing was configured against
 * a path this section has never seen hold anything, so a stage that arrives
 * carrying its subject has nothing to reset. Everything after it is a
 * transition, and a transition out of `undefined` is the commonest one there
 * is — a path that starts absent is exactly the path a researcher is about to
 * fill in for the first time.
 */
describe('a value the researcher changed', () => {
  it('hears the first selection at a path that started absent', async () => {
    const user = userEvent.setup();
    const onResearcherChange = vi.fn();
    const session = createSession();
    renderProbeEditor(session, onResearcherChange, 'roster-file-1');

    // Nothing has been chosen yet, and the section has not been told anything.
    expect(onResearcherChange).not.toHaveBeenCalled();

    await pickTheRosterFile(user);

    await waitFor(() => {
      expect(onResearcherChange).toHaveBeenCalledWith('roster-file-1');
    });
    expect(onResearcherChange).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the draft catches up with what the form already holds', async () => {
    const user = userEvent.setup();
    const onResearcherChange = vi.fn();
    const session = createSession();
    renderProbeEditor(session, onResearcherChange, 'roster-file-1');

    await pickTheRosterFile(user);
    await waitFor(() => {
      expect(onResearcherChange).toHaveBeenCalledTimes(1);
    });

    // The agreed draft arriving at the value the controls already hold is the
    // choice coming back, not a second one.
    act(() => {
      session.dispatch([
        { op: 'set', key: 'dataSource', value: 'roster-file-1' },
      ]);
    });

    await waitFor(() => {
      expect(session.getSnapshot().editedSection.fields.dataSource).toBe(
        'roster-file-1',
      );
    });
    expect(onResearcherChange).toHaveBeenCalledTimes(1);
  });
});

/**
 * A capability configured against a prerequisite that was not there.
 *
 * Both consequences of hearing the researcher's first choice one transition
 * late: the values describing the file that is gone survive into the save, and
 * the choice itself never reaches the session in a batch of its own — so the
 * session cannot know that everything written afterwards describes a file only
 * a finish can commit.
 */
describe('a capability whose prerequisite starts absent', () => {
  it('clears the stale values when the researcher chooses the prerequisite', async () => {
    const user = userEvent.setup();
    const session = createSession();
    renderRosterEditor(session, 'roster-file-1');

    expect(
      session.getSnapshot().editedSection.fields.cardOptions,
    ).toBeDefined();

    await pickTheRosterFile(user);

    await waitFor(() => {
      const { fields } = session.getSnapshot().editedSection;
      // The columns named columns of a file the stage did not have. A
      // different file has different columns, so they describe nothing now.
      expect(Object.hasOwn(fields, 'cardOptions')).toBe(false);
      // The choice travels with the clear, in the same batch: a clear on its
      // own says "these settings are gone" about a file the reader still
      // thinks is there.
      expect(fields.dataSource).toBe('roster-file-1');
    });
  });

  it('holds back a bound-list edit made against a file only a finish can commit', async () => {
    const user = userEvent.setup();
    const delivered: PendingCommandBatch[] = [];
    const resourceGateway = new InMemoryResourceGateway();
    const session = createSession({
      resourceGateway,
      onCommands: (batch) => {
        delivered.push(batch);
      },
    });

    await act(async () => {
      await session.getResourceGateway()?.stageUpload({
        requestId: 'roster-upload',
        kind: 'network',
        name: 'People I know',
        source: 'roster.json',
        contentType: 'application/json',
        bytes: ROSTER_BYTES,
      });
    });
    const staged = session.getSnapshot().stagedResources[0];
    expect(staged).toBeDefined();
    const stagedId = staged?.id ?? '';

    renderRosterEditor(session, stagedId);
    await pickTheRosterFile(user);

    await waitFor(() => {
      expect(
        Object.hasOwn(
          session.getSnapshot().editedSection.fields,
          'cardOptions',
        ),
      ).toBe(false);
    });

    // The choice is in the session, naming bytes only a finish will promote,
    // so the batch carrying it is withheld and every batch after it waits with
    // it. A row added to the card details now describes columns of a file the
    // host has never seen.
    act(() => {
      session.dispatch([
        {
          op: 'insertItem',
          key: 'cardOptions.additionalProperties',
          index: 0,
          item: { label: 'Nickname', variable: 'nickname' },
        },
      ]);
    });

    // Nothing at all: the row reaching a live-applying host before the file
    // does would leave the host holding an edit a cancel of this session can
    // no longer take back.
    expect(delivered).toEqual([]);
  });
});
