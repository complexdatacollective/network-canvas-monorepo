import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import ProtocolField from '../../form/ProtocolField.tsx';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import type { RuleDraft } from '../rule.ts';
import type { RuleSetValue } from '../ruleSet.ts';
import { QueryRuleSetField } from '../RuleSetField.tsx';

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });
const placeSection = sectionId({ kind: 'codebookNode', typeId: 'place' });
const friendSection = sectionId({ kind: 'codebookEdge', typeId: 'friend' });
const egoSection = sectionId({ kind: 'codebookEgo' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });

/**
 * The field this harness mounts is `skipLogic.filter`, which every stage type
 * in the schema has. The rule set is the same control wherever it appears; the
 * Sections that own skip logic and network filtering compose it in the next
 * slice.
 */
const RULE_SET_FIELD = 'skipLogic.filter';
const ADD_RULE = 'Add new skip logic rule';

const personDefinition: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-2',
  shape: { default: 'square' },
  variables: {
    age: { name: 'Age', type: 'number' },
    mood: {
      name: 'Mood',
      type: 'categorical',
      options: [
        { label: 'Happy', value: 'happy' },
        { label: 'Sad', value: 'sad' },
      ],
    },
  },
};

const baseSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Rule editing', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: {
    id: 'stage-1',
    type: 'Information',
    label: 'Welcome',
    title: 'Welcome',
    items: [],
  },
  [personSection]: personDefinition,
  [friendSection]: { name: 'Friend', color: 'edge-color-seq-3' },
  [egoSection]: { variables: { egoName: { name: 'EgoName', type: 'text' } } },
};

function createSession(
  options: Readonly<{
    rules?: readonly RuleDraft[];
    join?: string;
    sections?: Record<string, SectionDoc>;
  }> = {},
) {
  const filter =
    options.rules === undefined
      ? undefined
      : {
          ...(options.join === undefined ? {} : { join: options.join }),
          rules: [...options.rules],
        };

  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: {
      label: 'Welcome',
      title: 'Welcome',
      items: [],
      ...(filter === undefined ? {} : { skipLogic: { filter } }),
    },
    protocolSections: options.sections ?? baseSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Rule editing',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

/**
 * Reports the rule set the FORM is holding, so a test can assert on the value
 * the field would save rather than on the markup that renders it.
 */
function RuleSetProbe() {
  const value = useFormValue([RULE_SET_FIELD])[RULE_SET_FIELD];
  return (
    <output data-testid="rule-set-value">
      {JSON.stringify(value ?? null)}
    </output>
  );
}

const probedRuleSet = (): RuleSetValue | null => {
  const text = screen.getByTestId('rule-set-value').textContent ?? 'null';
  // The probe writes exactly what the form holds; anything else is a bug in
  // the probe, not a shape to be tolerated here.
  return JSON.parse(text) as RuleSetValue | null;
};

function Editor({ session }: { session: ProtocolBuilderSessionStore }) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      <BuilderSection title="Skip logic">
        {/*
          The whole composition: a name and a label. No stage path, no
          selector, no codebook prop, no host store.
        */}
        <ProtocolField
          name={RULE_SET_FIELD}
          label="Rules"
          component={QueryRuleSetField}
        />
        <RuleSetProbe />
      </BuilderSection>
    </StageEditorShell>
  );
}

function renderEditor(session: ProtocolBuilderSessionStore) {
  return render(
    <DialogProvider>
      <Editor session={session} />
    </DialogProvider>,
  );
}

const openRuleEditor = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: ADD_RULE }));
  return await screen.findByRole('dialog', { name: 'Construct a Rule' });
};

const nodeRule = (id: string, typeId = 'person'): RuleDraft => ({
  id,
  type: 'node',
  options: { type: typeId, operator: 'EXISTS' },
});

describe('the rule set field', () => {
  it('names itself from the field that renders it', () => {
    renderEditor(createSession());
    expect(screen.getByRole('group', { name: /Rules/ })).toBeInTheDocument();
  });

  it('offers the entity types the protocol context holds, with no codebook prop', async () => {
    const user = userEvent.setup();
    renderEditor(createSession());

    await openRuleEditor(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );

    expect(
      await screen.findByRole('radio', { name: 'Person' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Place' })).toBeNull();
  });

  it('offers ego rules to a query and reads the ego attributes from context', async () => {
    const user = userEvent.setup();
    renderEditor(createSession());

    await openRuleEditor(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Ego - match one of the ego attributes.',
      }),
    );

    const attribute = await screen.findByRole('combobox', {
      name: /Ego attribute/,
    });
    expect(
      within(attribute).getByRole('option', { name: 'EgoName' }),
    ).toBeInTheDocument();
  });

  it('adds a rule through the editor and shows it as a sentence', async () => {
    const user = userEvent.setup();
    renderEditor(createSession());

    await openRuleEditor(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(await screen.findByRole('radio', { name: 'Person' }));
    await user.click(await screen.findByRole('option', { name: /Presence/ }));
    await user.click(await screen.findByRole('radio', { name: 'exists' }));
    await user.click(screen.getByRole('button', { name: 'Finish and Close' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Construct a Rule' }),
      ).toBeNull(),
    );

    const saved = probedRuleSet();
    expect(saved?.rules).toHaveLength(1);
    expect(saved?.rules?.[0]).toMatchObject({
      type: 'node',
      options: { type: 'person', operator: 'EXISTS' },
    });
    expect(saved?.rules?.[0]?.id).toEqual(expect.any(String));
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('exists')).toBeInTheDocument();
  });

  it('refuses a rule the schema would not accept', async () => {
    const user = userEvent.setup();
    renderEditor(createSession());

    await openRuleEditor(user);
    await user.click(screen.getByRole('button', { name: 'Finish and Close' }));

    // Still open, with the missing choice reported rather than a rule saved.
    expect(
      screen.getByRole('dialog', { name: 'Construct a Rule' }),
    ).toBeInTheDocument();
    expect(probedRuleSet()).toBeNull();
  });
});

describe('rule list identity', () => {
  it('keeps the surviving rule when one is deleted', async () => {
    const user = userEvent.setup();
    renderEditor(
      createSession({
        join: 'AND',
        rules: [nodeRule('rule-a'), nodeRule('rule-b')],
      }),
    );

    const [firstDelete] = screen.getAllByRole('button', {
      name: /^Delete rule:/,
    });
    expect(firstDelete).toBeDefined();
    await user.click(firstDelete!);
    // Deleting a rule is a real loss, so the list confirms it first.
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(probedRuleSet()?.rules).toHaveLength(1));
    expect(probedRuleSet()?.rules?.[0]?.id).toBe('rule-b');
    // One rule combines with nothing, so the join goes with the deletion.
    expect(probedRuleSet()?.join).toBeUndefined();
  });

  it('moves a rule without changing which rule it is', async () => {
    const user = userEvent.setup();
    renderEditor(
      createSession({
        join: 'AND',
        rules: [nodeRule('rule-a'), nodeRule('rule-b')],
      }),
    );

    const handle = screen.getByRole('button', { name: 'Reorder item 1 of 2' });
    handle.focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() =>
      expect(probedRuleSet()?.rules?.map((rule) => rule.id)).toEqual([
        'rule-b',
        'rule-a',
      ]),
    );
    expect(probedRuleSet()?.join).toBe('AND');
  });

  it('asks how two rules combine, and records the answer', async () => {
    const user = userEvent.setup();
    renderEditor(
      createSession({ rules: [nodeRule('rule-a'), nodeRule('rule-b')] }),
    );

    await user.click(screen.getByRole('radio', { name: 'Any rule can match' }));

    await waitFor(() => expect(probedRuleSet()?.join).toBe('OR'));
    expect(probedRuleSet()?.rules?.map((rule) => rule.id)).toEqual([
      'rule-a',
      'rule-b',
    ]);
  });

  it('does not offer a combination for a single rule', () => {
    renderEditor(createSession({ rules: [nodeRule('rule-a')] }));
    expect(
      screen.queryByRole('radio', { name: 'Any rule can match' }),
    ).toBeNull();
  });
});

describe('rules the codebook can no longer account for', () => {
  it('reports a deleted attribute on the rule, without throwing', () => {
    renderEditor(
      createSession({
        rules: [
          {
            id: 'rule-a',
            type: 'node',
            options: {
              type: 'person',
              attribute: 'favouriteColour',
              operator: 'EXACTLY',
              value: 'blue',
            },
          },
        ],
      }),
    );

    expect(
      screen.getByText(
        'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    // The rest of the rule still reads, so the researcher can see which one to
    // fix.
    expect(screen.getByText('favouriteColour')).toBeInTheDocument();
  });

  it('reports a deleted entity type on the rule, without throwing', () => {
    renderEditor(createSession({ rules: [nodeRule('rule-a', 'ghost')] }));

    expect(
      screen.getByText(
        'This rule refers to a node type that is no longer in the codebook. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a codebook that changes underneath the editor', () => {
  it('renames an entity type in every rule that names it', async () => {
    const session = createSession({ rules: [nodeRule('rule-a')] });
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
    expect(screen.queryByText('Person')).toBeNull();
  });

  it('offers an entity type a collaborator adds while the editor is open', async () => {
    const user = userEvent.setup();
    const session = createSession();
    renderEditor(session);

    await openRuleEditor(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    expect(await screen.findByRole('radio', { name: 'Person' })).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Place' })).toBeNull();

    act(() => {
      session.receiveAuthoritativeUpdate({
        protocolSections: {
          ...baseSections,
          [placeSection]: {
            name: 'Place',
            color: 'node-color-seq-3',
            shape: { default: 'circle' },
          },
        },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(
      await screen.findByRole('radio', { name: 'Place' }),
    ).toBeInTheDocument();
  });

  it('reports a rule whose attribute a collaborator has just deleted', async () => {
    const session = createSession({
      rules: [
        {
          id: 'rule-a',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'mood',
            operator: 'INCLUDES',
            value: ['happy'],
          },
        },
      ],
    });
    renderEditor(session);

    expect(screen.getByText('Mood')).toBeInTheDocument();
    expect(screen.getByText('Happy')).toBeInTheDocument();

    act(() => {
      session.receiveAuthoritativeUpdate({
        protocolSections: {
          ...baseSections,
          [personSection]: {
            ...personDefinition,
            variables: { age: { name: 'Age', type: 'number' } },
          },
        },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(
      await screen.findByText(
        'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    // The stored operand is shown verbatim once its option set is gone, rather
    // than the label it used to resolve to.
    expect(screen.getByText('happy')).toBeInTheDocument();
  });
});
