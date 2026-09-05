import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DialogModule from '@codaco/fresco-ui/dialogs/Dialog';
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
import RuleEditorDialog, { type RuleTypeOption } from '../RuleEditorDialog.tsx';
import type { RuleSetValue } from '../ruleSet.ts';
import { QueryRuleSetField } from '../RuleSetField.tsx';

/**
 * `layoutId` is a Motion prop, so it leaves no trace in the DOM: what the rule
 * editor's caller needs to know is that the dialog RECEIVED the identity of
 * the row it morphs out of, which is what this records. Fresco's own `Dialog`
 * is still the thing that renders — the mock is a passthrough, so every test
 * in this file exercises the real component.
 */
const dialogRenders = vi.hoisted(() =>
  vi.fn<(props: { layoutId?: string }) => void>(),
);

vi.mock('@codaco/fresco-ui/dialogs/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof DialogModule>();
  const RealDialog = actual.default;
  return {
    ...actual,
    default: (props: DialogModule.DialogProps) => {
      dialogRenders(props);
      return createElement(RealDialog, props);
    },
  };
});

beforeEach(() => {
  dialogRenders.mockClear();
});

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });
const friendSection = sectionId({ kind: 'codebookEdge', typeId: 'friend' });
const egoSection = sectionId({ kind: 'codebookEgo' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });

const RULE_SET_FIELD = 'skipLogic.filter';
const ADD_RULE = 'Add new skip logic rule';
const RULE_EDITOR = 'Construct a Rule';

const RULE_TYPES: readonly RuleTypeOption[] = [
  {
    label: 'Node - match a node type or one of its attributes.',
    value: 'node',
  },
  { label: 'Ego - match one of the ego attributes.', value: 'ego' },
];

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
  [personSection]: {
    name: 'Person',
    color: 'node-color-seq-2',
    shape: { default: 'square' },
    variables: { age: { name: 'Age', type: 'number' } },
  },
  [friendSection]: { name: 'Friend', color: 'edge-color-seq-3' },
  [egoSection]: { variables: { egoName: { name: 'EgoName', type: 'text' } } },
};

const nodeRule = (id: string): RuleDraft => ({
  id,
  type: 'node',
  options: { type: 'person', operator: 'EXISTS' },
});

function createSession(rules?: readonly RuleDraft[]) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: {
      label: 'Welcome',
      title: 'Welcome',
      items: [],
      ...(rules === undefined
        ? {}
        : { skipLogic: { filter: { rules: [...rules] } } }),
    },
    protocolSections: baseSections,
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

/** Reports the rule set the form holds, so a test can assert what was saved. */
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
  return JSON.parse(text) as RuleSetValue | null;
};

/**
 * The whole composition a researcher meets: a rule set field whose rows open
 * the editor. Everything the editor does about saving, cancelling and morphing
 * is a conversation with the list, so it is tested through the list.
 */
function ListEditor({ session }: { session: ProtocolBuilderSessionStore }) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      <BuilderSection title="Skip logic">
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

function renderRuleList(rules?: readonly RuleDraft[]) {
  render(
    <DialogProvider>
      <ListEditor session={createSession(rules)} />
    </DialogProvider>,
  );
}

/**
 * The editor on its own, opened with the props a caller controls. Used only
 * for the shared-element identity, which no list row can state a value for.
 */
function StandaloneEditor({ layoutId }: { layoutId?: string }) {
  const [session] = useState(() => createSession());
  const controller = useStageEditorController(session, 'stage-form');
  const [open, setOpen] = useState(true);

  return (
    <StageEditorShell controller={controller}>
      <RuleEditorDialog
        open={open}
        seed={{ type: '' }}
        ruleTypes={RULE_TYPES}
        onSave={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        {...(layoutId === undefined ? {} : { layoutId })}
      />
    </StageEditorShell>
  );
}

function renderStandaloneEditor(layoutId?: string) {
  render(
    <DialogProvider>
      <StandaloneEditor {...(layoutId === undefined ? {} : { layoutId })} />
    </DialogProvider>,
  );
}

const openNewRule = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: ADD_RULE }));
  return await screen.findByRole('dialog', { name: RULE_EDITOR });
};

const openExistingRule = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Edit rule:/ }));
  return await screen.findByRole('dialog', { name: RULE_EDITOR });
};

/** An ego rule as far as its operator, leaving the operand to the caller. */
const buildEgoRuleUpTo = async (
  user: ReturnType<typeof userEvent.setup>,
  operator: string,
) => {
  await user.click(
    screen.getByRole('radio', {
      name: 'Ego - match one of the ego attributes.',
    }),
  );
  await user.selectOptions(
    await screen.findByRole('combobox', { name: /Ego attribute/ }),
    'egoName',
  );
  await user.selectOptions(
    await screen.findByRole('combobox', { name: /Operator/ }),
    operator,
  );
};

const finishAndClose = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Finish and Close' }));

describe('the shared-element morph out of a rule row', () => {
  it('hands the dialog the identity it was opened with', async () => {
    renderStandaloneEditor('rule-row-7');

    await waitFor(() =>
      expect(dialogRenders).toHaveBeenCalledWith(
        expect.objectContaining({ layoutId: 'rule-row-7' }),
      ),
    );
  });

  it('hands the dialog no identity when it was opened without one', async () => {
    renderStandaloneEditor();

    await screen.findByRole('dialog', { name: RULE_EDITOR });
    expect(
      dialogRenders.mock.calls.every(([props]) => props.layoutId === undefined),
    ).toBe(true);
  });

  it('pairs an edited row with the dialog that replaces it', async () => {
    const user = userEvent.setup();
    renderRuleList([nodeRule('rule-a')]);

    await openExistingRule(user);

    // The row's identity is minted by the list, so what there is to assert is
    // that one was handed over at all.
    await waitFor(() =>
      expect(dialogRenders).toHaveBeenCalledWith(
        expect.objectContaining({ layoutId: expect.any(String) as string }),
      ),
    );
  });

  it('gives a rule with no row of its own nothing to travel from', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);

    // A rule being added has no row yet, so there is nothing for the dialog to
    // be the same thing as — and borrowing another row's identity would morph
    // it out of a rule it has nothing to do with.
    expect(
      dialogRenders.mock.calls.every(([props]) => props.layoutId === undefined),
    ).toBe(true);
  });
});

describe('dismissing the rule editor', () => {
  it('asks before discarding a rule the researcher has started', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByText(
        'This editor holds changes that have not been saved. Closing it now discards them.',
      ),
    ).toBeInTheDocument();
    // Still open behind the question, with the choice the researcher made.
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(probedRuleSet()).toBeNull();
  });

  it('keeps the rule on screen when the researcher decides not to discard it', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Keep editing' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    ).toBeChecked();
  });

  it('closes a rule opened for editing and left alone, without asking', async () => {
    const user = userEvent.setup();
    renderRuleList([nodeRule('rule-a')]);

    await openExistingRule(user);
    // The rule the editor opened on is on screen, so the values the fields
    // registered with are the seeded ones rather than empty: what follows is a
    // dismissal of an untouched draft, not of one that never loaded.
    expect(await screen.findByRole('radio', { name: 'Person' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(
      screen.queryByRole('button', { name: 'Discard changes' }),
    ).not.toBeInTheDocument();
    // The rule it was opened on is still there, unchanged.
    expect(probedRuleSet()?.rules).toHaveLength(1);
  });
});

describe('a rule the editor refuses to save', () => {
  it('attaches an unanswered part of the rule to the control that holds it', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await buildEgoRuleUpTo(user, 'EXACTLY');
    // Everything but the operand, which the chosen operator compares against.
    await finishAndClose(user);

    const operand = await screen.findByRole('textbox', {
      name: 'Attribute value',
    });
    await waitFor(() =>
      expect(operand).toHaveAccessibleDescription(/This field is required/),
    );
    expect(operand).toHaveFocus();
    expect(operand).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    expect(probedRuleSet()).toBeNull();
  });

  it('attaches an operand that is not a regular expression to the operand control', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await buildEgoRuleUpTo(user, 'CONTAINS');
    // `[[` is user-event's escape for a literal opening bracket, which is what
    // makes this an unterminated character class rather than a key descriptor.
    await user.type(
      await screen.findByRole('textbox', { name: 'Attribute value' }),
      '[[unclosed',
    );
    await finishAndClose(user);

    const operand = screen.getByRole('textbox', { name: 'Attribute value' });
    await waitFor(() =>
      expect(operand).toHaveAccessibleDescription(
        /This is not a valid regular expression/,
      ),
    );
    expect(operand).toHaveFocus();
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    expect(probedRuleSet()).toBeNull();

    // The refusal is a correction, not a dead end: fixing the expression and
    // asking again saves the rule.
    await user.type(operand, ']');
    await finishAndClose(user);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(probedRuleSet()?.rules?.[0]).toMatchObject({
      type: 'ego',
      options: {
        attribute: 'egoName',
        operator: 'CONTAINS',
        value: '[unclosed]',
      },
    });
  });
});

describe('saving a rule', () => {
  it('keeps the rule the row was edited into, rather than discarding the row', async () => {
    const user = userEvent.setup();
    renderRuleList([nodeRule('rule-a')]);

    await openExistingRule(user);
    await user.click(
      await screen.findByRole('radio', { name: 'does not exist' }),
    );
    await finishAndClose(user);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    // One save, one close: the rule keeps its identity and its new operator,
    // and the row it was edited from is still in the list.
    expect(probedRuleSet()?.rules).toEqual([
      {
        id: 'rule-a',
        type: 'node',
        options: { type: 'person', operator: 'NOT_EXISTS' },
      },
    ]);
  });
});
