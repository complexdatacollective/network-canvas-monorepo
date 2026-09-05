import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import {
  createStageIdentity,
  type FinishRequest,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import NetworkFilterSection, {
  type NetworkFilterSubject,
} from '../NetworkFilterSection.tsx';

const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });
const friendSection = sectionId({ kind: 'codebookEdge', typeId: 'friend' });
const bestSection = sectionId({ kind: 'codebookEdge', typeId: 'best' });

const personDefinition: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-2',
  shape: { default: 'square' },
  variables: { age: { name: 'Age', type: 'number', component: 'Number' } },
};

const baseSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Filter editing', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [personSection]: personDefinition,
  [friendSection]: { name: 'Friend', color: 'edge-color-seq-3' },
  [bestSection]: { name: 'Best friend', color: 'edge-color-seq-4' },
};

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: { age: { name: 'Age', type: 'number', component: 'Number' } },
    },
  },
  edge: {
    friend: { name: 'Friend', color: 'edge-color-seq-3' },
    best: { name: 'Best friend', color: 'edge-color-seq-4' },
  },
};

/** An `AlterForm` is the least-configured stage the schema gives a filter. */
const alterFormFields: SectionDoc = {
  label: 'Details',
  subject: { entity: 'node', type: 'person' },
  form: { fields: [{ variable: 'age', prompt: 'How old are they?' }] },
  introductionPanel: { title: 'About them', text: 'A few questions.' },
};

const nodeFilter = {
  rules: [
    {
      id: 'rule-a',
      type: 'node',
      options: { type: 'person', operator: 'EXISTS' },
    },
  ],
};

function createSession(
  options: Readonly<{
    type?: StageType;
    fields?: SectionDoc;
    sections?: Record<string, SectionDoc>;
    onFinish?: (request: FinishRequest) => void;
  }> = {},
) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity(options.type ?? 'AlterForm', () => 'stage-1'),
    fields: options.fields ?? alterFormFields,
    protocolSections: options.sections ?? baseSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Filter editing',
      schemaVersion: 8,
      codebook,
      stages: [stageDocument],
    }),
    ...(options.onFinish === undefined ? {} : { onFinish: options.onFinish }),
  });
}

/**
 * A stage editor mounting the shared filter and nothing else it does not need.
 *
 * The section is told what the stage works on and nothing more: no field name,
 * no stage path, no codebook, no selector.
 */
function Editor({
  session,
  subject = 'node',
}: {
  session: ProtocolBuilderSessionStore;
  subject?: NetworkFilterSubject;
}) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      <NetworkFilterSection subject={subject} />
    </StageEditorShell>
  );
}

function renderEditor(
  session: ProtocolBuilderSessionStore,
  subject?: NetworkFilterSubject,
) {
  return render(
    <DialogProvider>
      <Editor session={session} subject={subject} />
    </DialogProvider>,
  );
}

const switchFilter = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('switch', { name: 'Stage filter' }));

const outlineItems = () =>
  screen
    .getByRole('navigation', { name: 'Stage sections' })
    .querySelectorAll('button');

const outlineText = () => [...outlineItems()].map((item) => item.textContent);

describe('what the section says it is for', () => {
  it('names the nodes a node stage filters', () => {
    renderEditor(createSession(), 'node');

    expect(
      screen.getByText(
        'Create rules that limit which nodes are available on this stage.',
      ),
    ).toBeInTheDocument();
  });

  it('names the edges an edge stage filters', () => {
    renderEditor(createSession(), 'edge');

    expect(
      screen.getByText(
        'Create rules that limit which edges are available on this stage.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a codebook that changes underneath the filter', () => {
  it('renames a type in the rules without writing anything back to the stage', async () => {
    const session = createSession({
      fields: { ...alterFormFields, filter: nodeFilter },
    });
    renderEditor(session);

    expect(screen.getByText('Person')).toBeInTheDocument();

    act(() => {
      session.receiveAuthoritativeUpdate({
        protocolSections: {
          ...baseSections,
          [personSection]: { ...personDefinition, name: 'Participant' },
        },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(await screen.findByText('Participant')).toBeInTheDocument();
    // Someone else's edit is not this editor's edit. Reflecting it must not
    // queue a command of our own — that would attribute their change to this
    // researcher and, on a lost lease, roll back something they never made.
    expect(session.getSnapshot().pendingCommands).toHaveLength(0);
    expect(session.getSnapshot().editedSection.fields.filter).toEqual(
      nodeFilter,
    );
  });
});

describe('switching the filter off', () => {
  it('removes it from the stage entirely', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        fields: { ...alterFormFields, filter: nodeFilter },
        onFinish,
      }),
    );

    await switchFilter(user);
    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    // Absent, not an empty rule set: absence is how the schema spells "this
    // stage is not filtered".
    expect(Object.hasOwn(request.stageDocument, 'filter')).toBe(false);
  });

  it('asks first, and keeps the rules when the answer is no', async () => {
    const user = userEvent.setup();
    renderEditor(
      createSession({ fields: { ...alterFormFields, filter: nodeFilter } }),
    );

    await switchFilter(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull(),
    );
    expect(screen.getByText('Person')).toBeInTheDocument();
  });

  it('switches back on with an editable, empty rule set', async () => {
    const user = userEvent.setup();
    renderEditor(
      createSession({ fields: { ...alterFormFields, filter: nodeFilter } }),
    );

    await switchFilter(user);
    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Filter rules/ })).toBeNull(),
    );

    await switchFilter(user);

    expect(
      await screen.findByRole('group', { name: /Filter rules/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add new filter rule' }),
    ).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Delete rule:/ })).toBeNull();
  });
});

describe('rules that contradict the rest of the stage', () => {
  const sociogramFields = (filter: unknown): SectionDoc => ({
    label: 'Connections',
    subject: { entity: 'node', type: 'person' },
    background: { concentricCircles: 4 },
    prompts: [
      {
        id: 'prompt-1',
        text: 'Who do you know?',
        layout: { layoutVariable: 'age' },
        edges: { create: 'friend' },
      },
    ],
    ...(filter === undefined ? {} : { filter }),
  });

  const edgeRule = (type: string, operator: string) => ({
    rules: [{ id: 'rule-a', type: 'edge', options: { type, operator } }],
  });

  it('warns when the rules would hide an edge the prompts create', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        fields: sociogramFields(edgeRule('best', 'EXISTS')),
      }),
    );

    expect(
      screen.getByText('Filter rules hide configured values'),
    ).toBeInTheDocument();
  });

  it('stays quiet when the rules let the configured edge through', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        fields: sociogramFields(edgeRule('friend', 'EXISTS')),
      }),
    );

    expect(
      screen.queryByText('Filter rules hide configured values'),
    ).toBeNull();
  });

  it('stays quiet when the stage configures no edges at all', () => {
    renderEditor(
      createSession({ fields: { ...alterFormFields, filter: nodeFilter } }),
    );

    expect(
      screen.queryByText('Filter rules hide configured values'),
    ).toBeNull();
  });

  it('warns when the rules name an edge the prompts create as one that must not exist', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        // Nothing is required to exist here, so the only thing that keeps this
        // edge off the stage is being named by a rule that excludes it.
        fields: sociogramFields(edgeRule('friend', 'NOT_EXISTS')),
      }),
    );

    expect(
      screen.getByText('Filter rules hide configured values'),
    ).toBeInTheDocument();
  });

  it('stays quiet when the only rules are about nodes', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        // A rule about a node type says nothing about which edges reach the
        // stage. Folding its entity type into the edge comparison makes the
        // configured `friend` edge look like one no rule lets through.
        fields: sociogramFields(nodeFilter),
      }),
    );

    expect(
      screen.queryByText('Filter rules hide configured values'),
    ).toBeNull();
  });

  it('still warns about an edge rule standing beside a node rule', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        fields: sociogramFields({
          join: 'AND',
          rules: [
            {
              id: 'rule-a',
              type: 'node',
              options: { type: 'person', operator: 'EXISTS' },
            },
            {
              id: 'rule-b',
              type: 'edge',
              options: { type: 'best', operator: 'EXISTS' },
            },
          ],
        }),
      }),
    );

    expect(
      screen.getByText('Filter rules hide configured values'),
    ).toBeInTheDocument();
  });

  it('warns when rules that must ALL match require different edge types', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        fields: sociogramFields({
          join: 'AND',
          rules: [
            {
              id: 'rule-a',
              type: 'edge',
              options: { type: 'friend', operator: 'EXISTS' },
            },
            {
              id: 'rule-b',
              type: 'edge',
              options: { type: 'best', operator: 'EXISTS' },
            },
          ],
        }),
      }),
    );

    // `AND` feeds each rule's result into the next, so an edge has to survive
    // both — and no edge is of two types at once. A check that merely unioned
    // the types the rules NAME saw the configured Friend edge in the list and
    // said nothing, while the stage in fact shows no edges at all.
    expect(
      screen.getByText('Filter rules hide configured values'),
    ).toBeInTheDocument();
  });

  it('stays quiet when either of those rules would match on its own', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        fields: sociogramFields({
          join: 'OR',
          rules: [
            {
              id: 'rule-a',
              type: 'edge',
              options: { type: 'friend', operator: 'EXISTS' },
            },
            {
              id: 'rule-b',
              type: 'edge',
              options: { type: 'best', operator: 'EXISTS' },
            },
          ],
        }),
      }),
    );

    // The same two rules under `OR` run on the whole network and are merged,
    // so the configured Friend edge comes through the first of them.
    expect(
      screen.queryByText('Filter rules hide configured values'),
    ).toBeNull();
  });

  it('stays quiet when a node rule can bring the edges back under OR', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        fields: sociogramFields({
          join: 'OR',
          rules: [
            {
              id: 'rule-a',
              type: 'edge',
              options: { type: 'best', operator: 'EXISTS' },
            },
            {
              id: 'rule-b',
              type: 'node',
              options: { type: 'person', operator: 'EXISTS' },
            },
          ],
        }),
      }),
    );

    // Under `OR` the edges between the alters a node rule keeps are merged
    // back in whatever type they are, so no edge type is certainly hidden.
    expect(
      screen.queryByText('Filter rules hide configured values'),
    ).toBeNull();
  });

  it('counts the edges a prompt only displays, not just the ones it creates', () => {
    renderEditor(
      createSession({
        type: 'Sociogram',
        fields: {
          ...sociogramFields(edgeRule('friend', 'EXISTS')),
          prompts: [
            {
              id: 'prompt-1',
              text: 'Who do you know?',
              layout: { layoutVariable: 'age' },
              // Displayed rather than created, and still hidden by rules that
              // require a different edge type to exist.
              edges: { display: ['best'] },
            },
          ],
        },
      }),
    );

    expect(
      screen.getByText('Filter rules hide configured values'),
    ).toBeInTheDocument();
  });
});

describe('a filter the researcher cannot save', () => {
  it('refuses a rule set emptied down to nothing', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        fields: { ...alterFormFields, filter: nodeFilter },
        onFinish,
      }),
    );

    await user.click(screen.getByRole('button', { name: /^Delete rule:/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // A filter with an empty rule list is the shape the schema rejects with
    // "Too small: expected array to have >=1 items". Switching the capability
    // off is how a stage says it has no filter.
    expect(
      await screen.findByText('Please create at least one rule.'),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('refuses a filter switched on and left empty', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    renderEditor(createSession({ onFinish }));

    await switchFilter(user);
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // Switching the capability on writes nothing on its own, so an editor that
    // closed here would save a stage with no filter key — and the toggle would
    // be off again the next time the stage was opened, with nothing having
    // said so. The section stays on and unfinished until a rule is added or
    // the switch is turned off, and says which in the rule set's own words.
    expect(
      await screen.findByText('Please create at least one rule.'),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('reports a filter switched on and left empty as unfinished, not switched off', async () => {
    const user = userEvent.setup();
    renderEditor(createSession());
    await waitFor(() => expect(outlineItems().length).toBeGreaterThan(0));
    expect(outlineText()).toContain('Stage filterSwitched off');

    await switchFilter(user);

    await waitFor(() =>
      expect(outlineText()).toContain('Stage filterNot finished'),
    );
  });

  it('saves a stage with no filter key once the switch goes back off', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    renderEditor(createSession({ onFinish }));

    await switchFilter(user);
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /Filter rules/ })).toBeVisible(),
    );
    // Nothing was entered, so there is nothing to lose and nothing to confirm.
    await switchFilter(user);
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Filter rules/ })).toBeNull(),
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    expect(Object.hasOwn(request.stageDocument, 'filter')).toBe(false);
  });
});
