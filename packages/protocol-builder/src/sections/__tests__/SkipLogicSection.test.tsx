import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import ProtocolField from '../../form/ProtocolField.tsx';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import type { RuleDraft } from '../../rules/rule.ts';
import {
  createStageIdentity,
  type FinishRequest,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import BuilderSection from '../BuilderSection.tsx';
import InterviewerGuidanceSection from '../InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../SkipLogicSection.tsx';
import StageNameSection from '../StageNameSection.tsx';

const stageOrderSection = sectionId({ kind: 'stageOrder' });
const settingsSection = sectionId({ kind: 'settings' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const middleStage: SectionDoc = {
  id: 'stage-2',
  type: 'Information',
  label: 'Middle',
  title: 'Middle',
  items: [],
};

const finalStage: SectionDoc = {
  id: 'stage-3',
  type: 'Information',
  label: 'Goodbye',
  title: 'Goodbye',
  items: [],
};

/**
 * `mood` is here so a rule can name one of its OPTIONS: the codebook can move
 * under a rule by renaming an option as well as by deleting or retyping the
 * attribute itself.
 */
const personVariables = {
  age: { name: 'Age', type: 'number' },
  // Text, because the comparison operators whose operand is a regular
  // expression are offered against it.
  note: { name: 'Note', type: 'text' },
  // A date recorded to the day, so a rule can hold one and the variable can
  // then be retyped to record something coarser.
  born: {
    name: 'Born',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'full' },
  },
  mood: {
    name: 'Mood',
    type: 'categorical',
    options: [
      { label: 'Happy', value: 'happy' },
      { label: 'Sad', value: 'sad' },
    ],
  },
};

const personDefinition: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-2',
  shape: { default: 'square' },
  variables: personVariables,
};

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: personVariables,
    },
  },
};

const protocolSections = (
  order: readonly string[] = ['stage-1', 'stage-2', 'stage-3'],
): Record<string, SectionDoc> => ({
  [settingsSection]: { name: 'Skip logic editing', schemaVersion: 8 },
  [stageOrderSection]: { stages: [...order] },
  [sectionId({ kind: 'stage', stageId: 'stage-1' })]: {
    id: 'stage-1',
    type: 'Information',
    label: 'Welcome',
    title: 'Hello',
    items: [],
  },
  [sectionId({ kind: 'stage', stageId: 'stage-2' })]: middleStage,
  [sectionId({ kind: 'stage', stageId: 'stage-3' })]: finalStage,
  [personSection]: personDefinition,
});

const nodeRule = (id: string): RuleDraft => ({
  id,
  type: 'node',
  options: { type: 'person', operator: 'EXISTS' },
});

const otherStages: Readonly<Record<string, SectionDoc>> = {
  'stage-2': middleStage,
  'stage-3': finalStage,
};

/**
 * The interview as the stage order describes it, with the stage being edited
 * in its own place.
 *
 * A host assembles the candidate this way, and it is what makes `finish` a
 * real check on skip logic: a candidate holding only the edited stage would
 * accept a destination naming a stage that does not exist, and one holding a
 * fixed list would accept a destination that has since left the interview.
 */
const candidateStages = (
  order: readonly string[],
  stageDocument: SectionDoc,
): SectionDoc[] =>
  order.flatMap((stageId) => {
    if (stageId === 'stage-1') return [stageDocument];
    const stage = otherStages[stageId];
    return stage === undefined ? [] : [stage];
  });

function createSession(
  options: Readonly<{
    fields?: SectionDoc;
    order?: readonly string[];
    sections?: Record<string, SectionDoc>;
    onFinish?: (request: FinishRequest) => void;
  }> = {},
) {
  const order = options.order ?? ['stage-1', 'stage-2', 'stage-3'];

  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: options.fields ?? { label: 'Welcome', title: 'Hello', items: [] },
    protocolSections: options.sections ?? protocolSections(order),
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Skip logic editing',
      schemaVersion: 8,
      codebook,
      stages: candidateStages(order, stageDocument),
    }),
    ...(options.onFinish === undefined ? {} : { onFinish: options.onFinish }),
  });
}

/**
 * A real stage editor around whatever sections a test mounts in it: the same
 * shell, the same controller, the same submit button every editor has.
 *
 * Nothing here is told where the stage lives. No stage path, no selector, no
 * codebook prop, no host store — a name and a label per field, and the
 * sections read everything else from the editor's own context.
 */
function EditorShell({
  session,
  children,
}: {
  session: ProtocolBuilderSessionStore;
  children: ReactNode;
}) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      {children}
    </StageEditorShell>
  );
}

/**
 * The composition under test: the three sections every stage editor has, plus
 * one stage-specific section between them, in the order every editor uses.
 */
function Editor({
  session,
  position,
}: {
  session: ProtocolBuilderSessionStore;
  /** Where a stage being CREATED will be inserted. */
  position?: number;
}) {
  return (
    <EditorShell session={session}>
      <StageNameSection position={{ index: 1, total: 3 }} />
      <BuilderSection title="Page content">
        <ProtocolField
          name="title"
          label="Page heading"
          component={InputField}
        />
      </BuilderSection>
      <SkipLogicSection {...(position === undefined ? {} : { position })} />
      <InterviewerGuidanceSection />
    </EditorShell>
  );
}

function renderEditor(session: ProtocolBuilderSessionStore, position?: number) {
  return render(
    <DialogProvider>
      <Editor
        session={session}
        {...(position === undefined ? {} : { position })}
      />
    </DialogProvider>,
  );
}

/**
 * The same editor with nothing in it but the section under test.
 *
 * Every event re-renders every section the editor holds, and the sections
 * around this one are what the outline tests are for — a chain that never
 * touches them pays for them anyway. Opening the rule dialog costs about 90ms
 * here against about 230ms in the full composition, and on a CI runner
 * sharing four cores between several packages' suites those milliseconds are
 * multiplied by fifty. Used only where the assertions are about the section
 * itself; anything about how the section sits among the others mounts the
 * whole editor.
 */
function renderSkipLogicSection(session: ProtocolBuilderSessionStore) {
  return render(
    <DialogProvider>
      <EditorShell session={session}>
        <SkipLogicSection />
      </EditorShell>
    </DialogProvider>,
  );
}

const outlineItems = () =>
  screen
    .getByRole('navigation', { name: 'Stage sections' })
    .querySelectorAll('button');

const outlineText = () => [...outlineItems()].map((item) => item.textContent);

/**
 * What drives this editor, set up once so every test drives it the same way.
 *
 * `delay: null` is what makes the difference on a loaded CI runner. The
 * default asks user-event to wait a macrotask between the events of every
 * interaction, and a chain of them spends a third of its event-loop turns on
 * those waits alone — turns that cost about a millisecond here and far more
 * where several vitest workers share two cores. Nothing here needs time to
 * pass between a pointer-down and its click; the components that do (a
 * press-and-hold) have tests of their own.
 */
const setupUser = () => userEvent.setup({ delay: null });

const switchOn = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('switch', { name: 'Skip logic' }));

const configuredFields = (
  destination?: Record<string, unknown>,
): SectionDoc => ({
  label: 'Welcome',
  title: 'Hello',
  items: [],
  skipLogic: {
    action: 'SKIP',
    filter: { rules: [nodeRule('rule-a')] },
    ...(destination === undefined ? {} : { destination }),
  },
});

/**
 * Skip logic switched on and pointed somewhere, with no rules in it yet: the
 * state a researcher is in the moment they reach for the Add button.
 *
 * Stated as fields rather than reached by clicking, so a test about what the
 * rule editor builds spends its budget on the rule editor.
 */
const awaitingRulesFields = (): SectionDoc => ({
  label: 'Welcome',
  title: 'Hello',
  items: [],
  skipLogic: {
    action: 'SKIP',
    destination: { type: 'stage', stageId: 'stage-3' },
    filter: { rules: [] },
  },
});

describe('a stage editor composing the skip-logic section', () => {
  it('lists it between the stage-specific sections and interviewer guidance', async () => {
    renderEditor(createSession());

    await waitFor(() => expect(outlineItems()).toHaveLength(4));
    expect(outlineText()).toEqual([
      'Stage nameFinished',
      'Page contentFinished',
      'Skip logicSwitched off',
      'Interviewer guidanceSwitched off',
    ]);
  });

  it('opens already configured skip logic and reports it as finished', async () => {
    renderEditor(
      createSession({
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
      }),
    );

    await waitFor(() => expect(outlineItems()).toHaveLength(4));
    expect(outlineText()?.[2]).toBe('Skip logicFinished');
    expect(
      screen.getByRole('radio', { name: 'Skip this stage' }),
    ).toBeChecked();
  });

  it('reports a switched-on section whose required fields are empty as unfinished', async () => {
    const user = setupUser();
    renderEditor(createSession());
    await waitFor(() => expect(outlineItems()).toHaveLength(4));

    await switchOn(user);

    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicNot finished'),
    );
  });

  /**
   * Building skip logic from nothing is three chains, not one: switching the
   * section on and answering it, creating a rule in the editor it opens, and
   * saving what that produced. They were one test, whose interactions added up
   * to about half a second here and past the 20s budget on a CI runner sharing
   * four cores between several packages' suites — and whose failure said only
   * that the whole thing had stopped somewhere. One test per chain, each
   * mounted fresh on the state the one before it leaves behind, keeps every
   * assertion and puts a budget and a name on each.
   */
  it('records the action and the destination the researcher chooses', async () => {
    const user = setupUser();
    renderEditor(createSession());

    await switchOn(user);
    await user.click(screen.getByRole('radio', { name: 'Skip this stage' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:stage:stage-3',
    );

    expect(
      screen.getByRole('radio', { name: 'Skip this stage' }),
    ).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
    ).toHaveValue('route:stage:stage-3');
  });

  /**
   * Where the middle chain stops, and why.
   *
   * Answering the rule editor is seven interactions against a mounted stage
   * editor, and it is the same seven wherever a rule set appears: the rule set
   * field owns them, and `RuleSetField.test.tsx` drives them end to end
   * ("adds a rule through the editor and shows it as a sentence") against the
   * same assertions — a node rule about people, about whether one exists,
   * reaching the field's value and reading back as a sentence. The sibling
   * section that also embeds a rule set, `NetworkFilterSection.test.tsx`,
   * states its rules as fields for the same reason.
   *
   * What is this section's own is that ITS button opens that editor, and that
   * whatever the editor leaves in the rule set reaches `skipLogic.filter` —
   * the first below, the second in the test after it.
   */
  it('opens the rule editor from its own button', async () => {
    const user = setupUser();
    renderSkipLogicSection(createSession({ fields: awaitingRulesFields() }));

    await user.click(
      screen.getByRole('button', { name: 'Add new skip logic rule' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Construct a Rule',
    });
    // Opened on a new rule rather than on one of the set's own: it asks what
    // the rule is about, which a rule that already had an answer would not.
    expect(
      within(dialog).getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    ).not.toBeChecked();
  });

  it('builds skip logic the protocol schema accepts, with no stage path anywhere', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(createSession({ onFinish, fields: configuredFields() }));

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:stage:stage-3',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // `finish` validates the whole protocol before calling this, so arriving
    // here is itself proof the document is one the schema accepts.
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    expect(request.stageDocument.skipLogic).toEqual({
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: expect.any(String) as unknown as string,
            type: 'node',
            options: { type: 'person', operator: 'EXISTS' },
          },
        ],
      },
      destination: { type: 'stage', stageId: 'stage-3' },
    });
  });
});

describe('the rules inside skip logic', () => {
  const twoRuleFields: SectionDoc = {
    label: 'Welcome',
    title: 'Hello',
    items: [],
    skipLogic: {
      action: 'SHOW',
      filter: { join: 'AND', rules: [nodeRule('rule-a'), nodeRule('rule-b')] },
    },
  };

  it('keeps the surviving rule when one is deleted', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(createSession({ fields: twoRuleFields, onFinish }));

    const [firstDelete] = screen.getAllByRole('button', {
      name: /^Delete rule:/,
    });
    await user.click(firstDelete as HTMLElement);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    expect(ruleIds(request)).toEqual(['rule-b']);
  });

  it('moves a rule without changing which rule it is', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(createSession({ fields: twoRuleFields, onFinish }));

    screen.getByRole('button', { name: 'Reorder item 1 of 2' }).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    expect(ruleIds(request)).toEqual(['rule-b', 'rule-a']);
  });
});

/**
 * A rule set can be wrong in ways no control inside it can see. Each of these
 * used to reach the protocol schema first — or nothing at all until the stage
 * was saved — and be reported in the schema's own words against a path rather
 * than in the section that holds the rules.
 */
describe('a rule set the researcher cannot save', () => {
  const attributeRuleFields: SectionDoc = {
    label: 'Welcome',
    title: 'Hello',
    items: [],
    skipLogic: {
      action: 'SHOW',
      filter: {
        rules: [
          {
            id: 'rule-a',
            type: 'node',
            options: {
              type: 'person',
              attribute: 'age',
              operator: 'GREATER_THAN',
              value: 30,
            },
          },
        ],
      },
    },
  };

  const personWith = (variables: Record<string, unknown>) => ({
    ...protocolSections(),
    [personSection]: { ...personDefinition, variables },
  });

  it('refuses two rules that never said how they combine', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: {
          label: 'Welcome',
          title: 'Hello',
          items: [],
          // Two rules and no join: the shape the schema rejects with "Too big:
          // expected array to have <=1 items".
          skipLogic: {
            action: 'SHOW',
            filter: { rules: [nodeRule('rule-a'), nodeRule('rule-b')] },
          },
        },
      }),
    );

    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        'Please choose how these rules should be combined.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Rules/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('refuses a rule set the researcher has emptied', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
      }),
    );
    await waitFor(() => expect(outlineItems()).toHaveLength(4));

    await user.click(screen.getByRole('button', { name: /^Delete rule:/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    // An empty rule set still looks like an answer to the form, so nothing but
    // this check stands between it and the schema's "Too small" refusal.
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText('Please create at least one rule.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Rules/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onFinish).not.toHaveBeenCalled();
  });

  /**
   * A comparison pattern that will not compile, which nothing outside the
   * builder can report: the protocol schema asks only that the operand be a
   * string, and the interview swallows the compile error on purpose so that
   * one malformed rule cannot break navigation — after which the rule matches
   * nothing (or, for "does not contain", everything) for every participant.
   * It used to be caught only by reopening that exact rule and submitting it.
   */
  it('refuses a rule whose comparison pattern will not compile', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: {
          label: 'Welcome',
          title: 'Hello',
          items: [],
          skipLogic: {
            action: 'SHOW',
            filter: {
              rules: [
                {
                  id: 'rule-a',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'note',
                    operator: 'CONTAINS',
                    // An unterminated character class.
                    value: '[unclosed',
                  },
                },
              ],
            },
          },
        },
      }),
    );

    expect(
      await screen.findByText(
        'This rule compares its attribute against a pattern that is not a valid regular expression, so the interview cannot apply the rule. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        'Rule 1 cannot be used as it stands. Open it to fix it, or delete it.',
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  /**
   * A datetime attribute records answers at ONE resolution, and retyping it is
   * an ordinary codebook edit made by someone who cannot see this rule. The
   * operand is still a string, still the shape the schema and the operand
   * table ask for, and can never equal an answer again.
   */
  it('refuses a rule whose date the attribute can no longer record', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    const session = createSession({
      onFinish,
      fields: {
        label: 'Welcome',
        title: 'Hello',
        items: [],
        skipLogic: {
          action: 'SHOW',
          filter: {
            rules: [
              {
                id: 'rule-a',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'born',
                  operator: 'EXACTLY',
                  value: '2020-05-14',
                },
              },
            ],
          },
        },
      },
    });
    renderEditor(session);
    await waitFor(() => expect(outlineText()?.[2]).toBe('Skip logicFinished'));

    act(() => {
      session.receiveAuthoritativeUpdate({
        // The attribute is still a datetime and the operator is still legal
        // for one. Only the dates it records have changed.
        protocolSections: personWith({
          born: {
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'year' },
          },
        }),
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(
      await screen.findByText(
        'This rule compares its attribute against “2020-05-14”, but the attribute is now answered with a year, so the rule can never match. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('refuses a rule whose attribute a collaborator has deleted', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    const session = createSession({ onFinish, fields: attributeRuleFields });
    renderEditor(session);
    await waitFor(() => expect(outlineText()?.[2]).toBe('Skip logicFinished'));

    act(() => {
      session.receiveAuthoritativeUpdate({
        protocolSections: personWith({}),
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    // On the row, where the researcher can act on it, and in the outline, so
    // the section stops claiming to be finished.
    expect(
      await screen.findByText(
        'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('refuses a rule whose operator the attribute’s new type does not allow', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    const session = createSession({ onFinish, fields: attributeRuleFields });
    renderEditor(session);
    await waitFor(() => expect(outlineText()?.[2]).toBe('Skip logicFinished'));

    act(() => {
      session.receiveAuthoritativeUpdate({
        // The attribute is still there; comparing text with "greater than" is
        // not something the schema accepts.
        protocolSections: personWith({ age: { name: 'Age', type: 'text' } }),
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(
      await screen.findByText(
        'This rule uses an operator that is not valid for its attribute type. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('refuses a rule naming an option a collaborator has renamed', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    const session = createSession({
      onFinish,
      fields: {
        label: 'Welcome',
        title: 'Hello',
        items: [],
        skipLogic: {
          action: 'SHOW',
          filter: {
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
          },
        },
      },
    });
    renderEditor(session);
    await waitFor(() => expect(outlineText()?.[2]).toBe('Skip logicFinished'));

    act(() => {
      session.receiveAuthoritativeUpdate({
        // The attribute is still a categorical and the operator is still legal
        // for one. Only the option this rule names has gone.
        protocolSections: personWith({
          age: { name: 'Age', type: 'number' },
          mood: {
            name: 'Mood',
            type: 'categorical',
            options: [
              { label: 'Not working', value: 'not-working' },
              { label: 'Sad', value: 'sad' },
            ],
          },
        }),
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(
      await screen.findByText(
        'This rule compares its attribute against an option that is no longer one of that attribute’s choices. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('opens a stage whose stored rule already names a missing option', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    // The deployed-protocol case, and the reason membership is an editor rule
    // rather than a load-time error (ruling on issue #1548): the shared
    // validator accepts this protocol, so the editor is what has to open it,
    // show the researcher the rule, and refuse the save.
    renderEditor(
      createSession({
        onFinish,
        fields: {
          label: 'Welcome',
          title: 'Hello',
          items: [],
          skipLogic: {
            action: 'SHOW',
            filter: {
              rules: [
                {
                  id: 'rule-a',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'mood',
                    operator: 'INCLUDES',
                    value: ['retired'],
                  },
                },
              ],
            },
          },
        },
      }),
    );

    // The rule is on screen and readable, with the option it names printed as
    // the bare value the codebook has no label for — reporting a rule is not
    // refusing to show it.
    const row = await screen.findByRole('button', { name: /^Edit rule:/ });
    expect(row).toHaveAccessibleName(/Mood.*includes.*retired/s);
    expect(
      screen.getByText(
        'This rule compares its attribute against an option that is no longer one of that attribute’s choices. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  /**
   * The rule dialog refuses every gap, so a rule with no operand cannot have
   * been built here: it arrived by import, by hand-editing, or from another
   * session. The protocol schema accepts it — `value` is optional there — and
   * the interview then runs `EXACTLY` with nothing to compare, which is a
   * presence test the researcher never wrote. The editor is the only thing
   * that can say so.
   */
  it('refuses a stored rule whose operator was never given its operand', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: {
          label: 'Welcome',
          title: 'Hello',
          items: [],
          skipLogic: {
            action: 'SHOW',
            filter: {
              rules: [
                {
                  id: 'rule-a',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'age',
                    operator: 'EXACTLY',
                  },
                },
              ],
            },
          },
        },
      }),
    );

    // On the row, where the researcher can act on it, and in the outline, so
    // the section stops claiming to be finished.
    expect(
      await screen.findByText(
        'This rule is not complete. Edit it to fill in every part, or delete it.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(outlineText()?.[2]).toBe('Skip logicHas a problem'),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        'Rule 1 is not finished. Open it to fill in every part, or delete it.',
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('asks for the rules a switched-on skip logic has none of', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(createSession({ onFinish }));

    await switchOn(user);
    await user.click(screen.getByRole('radio', { name: 'Skip this stage' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:finish',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // Rules are what skip logic IS: a stage that switches it on and creates
    // none has said nothing about when to skip. Said in the rule set's own
    // words — the same sentence a set whose last rule was deleted is refused
    // with — rather than in Fresco's wording for an unanswered field.
    const rules = screen.getByRole('group', { name: /Rules/ });
    await waitFor(() =>
      expect(rules).toHaveAccessibleDescription(
        /Please create at least one rule\./,
      ),
    );
    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe('choosing where the interview continues', () => {
  it('offers only the stages that come after this one', async () => {
    renderEditor(createSession({ fields: configuredFields() }));

    const select = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });
    expect(
      [...select.querySelectorAll('option')].map(
        (option) => option.textContent,
      ),
    ).toEqual([
      'Next available stage',
      'Stage 2 — Middle',
      'Stage 3 — Goodbye',
      'End the interview',
    ]);
  });

  /**
   * A stage the interview does not contain yet is not in the stage order, so
   * only the host knows where it is about to be inserted — and that is what
   * decides which stages count as later than it, and what they will be
   * numbered once it exists.
   */
  it('offers a stage being created the stages it will be inserted before', () => {
    renderEditor(
      createSession({
        fields: configuredFields(),
        // This stage is not part of the interview yet.
        order: ['stage-2', 'stage-3'],
      }),
      // It is about to be inserted between them.
      1,
    );

    const select = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });
    expect(
      [...select.querySelectorAll('option')].map(
        (option) => option.textContent,
      ),
    ).toEqual([
      'Next available stage',
      // Stage 2 will come BEFORE this one, so it is not offered; stage 3 will
      // be the fourth stage once this one has been inserted.
      'Stage 3 — Goodbye',
      'End the interview',
    ]);
  });

  it('reports a destination whose stage has left the interview, without throwing', async () => {
    renderEditor(
      createSession({
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
        // The interview no longer contains stage 3.
        order: ['stage-1', 'stage-2'],
      }),
    );

    expect(
      screen.getByText(
        'The stage this skips to is no longer part of this interview. Choose where the interview should continue instead.',
      ),
    ).toBeInTheDocument();
    // The problem is a property of this destination, so it is described to
    // assistive technology by the control that holds it — and the control is
    // marked invalid, so it is not merely described as broken while still
    // reading as an acceptable answer.
    const destination = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });
    expect(destination).toHaveAccessibleDescription(
      /no longer part of this interview/,
    );
    expect(destination).toHaveAttribute('aria-invalid', 'true');
  });

  it('leaves a destination the interview can still reach marked valid', () => {
    renderEditor(
      createSession({
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
      }),
    );

    expect(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
    ).not.toHaveAttribute('aria-invalid', 'true');
  });

  /**
   * A destination with no stage named is a destination the protocol schema
   * refuses, and absence is how "continue at the next available stage" is
   * spelled — so reading the two the same way left the control claiming the
   * interview continued at the next stage while `finish` refused the save for
   * a destination the researcher was never shown.
   */
  it('reports a destination it cannot read, rather than showing the next stage', async () => {
    renderEditor(
      createSession({ fields: configuredFields({ type: 'stage' }) }),
    );

    expect(
      await screen.findByText(
        'The stage this skips to cannot be read. Choose where the interview should continue instead.',
      ),
    ).toBeInTheDocument();
    const destination = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });
    expect(destination).toHaveAttribute('aria-invalid', 'true');
    expect(destination).not.toHaveValue('route:next');
  });

  /**
   * The same gap on its other axis. The schema's two destination shapes are
   * `strictObject`s, so a stray key beside a valid discriminator is a
   * destination it refuses — and a reader that took the discriminator and
   * dropped the rest showed "End the interview" as a finished answer over a
   * stored value that could not be saved.
   */
  it('reports a destination carrying a key the schema refuses', async () => {
    renderEditor(
      createSession({
        fields: configuredFields({ type: 'finish', stageId: 'stale' }),
      }),
    );

    expect(
      await screen.findByText(
        'The stage this skips to cannot be read. Choose where the interview should continue instead.',
      ),
    ).toBeInTheDocument();
    const destination = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });
    expect(destination).toHaveAttribute('aria-invalid', 'true');
    expect(destination).not.toHaveValue('route:finish');
  });

  it('refuses to finish a stage holding one', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: configuredFields({ type: 'finish', stageId: 'stale' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).not.toHaveBeenCalled());
    expect(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  it('attributes the refusal of an extra key to the destination that holds it', async () => {
    const session = createSession({
      fields: configuredFields({ type: 'finish', stageId: 'stale' }),
    });

    const validation = await session.validate();

    // Reporting is not refusing: the control says which answer to change, and
    // the schema is what stops the stage being saved. Both have to be true,
    // or the researcher meets a refusal with no control to point at.
    expect(validation.status).toBe('invalid');
    const issues = validation.status === 'invalid' ? validation.issues : [];
    expect(issues.map((issue) => issue.path.slice(0, 4).join('.'))).toContain(
      'stages.0.skipLogic.destination',
    );
  });

  it('attributes the refusal of one to the destination that holds it', async () => {
    const session = createSession({
      fields: configuredFields({ type: 'stage' }),
    });

    const validation = await session.validate();

    // The control reports it so the researcher can act on it; the schema is
    // what refuses it. Both have to be true, or a destination nobody can read
    // is either invisible or unsaveable with no explanation.
    expect(validation.status).toBe('invalid');
    const issues = validation.status === 'invalid' ? validation.issues : [];
    expect(issues.map((issue) => issue.path.slice(0, 4).join('.'))).toContain(
      'stages.0.skipLogic.destination',
    );
  });

  it('reports a destination the interview now reaches first, without throwing', async () => {
    renderEditor(
      createSession({
        fields: configuredFields({ type: 'stage', stageId: 'stage-2' }),
        // Stage 1 has been moved to the end, so stage 2 now comes before it.
        order: ['stage-2', 'stage-3', 'stage-1'],
      }),
    );

    expect(
      screen.getByText(
        'The stage this skips to no longer comes after this one. Choose a later stage, or end the interview.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The control reports a stale destination so the researcher can see it, but
 * reporting is not refusing: what stops one being saved is the protocol schema
 * itself, through `finish`. These say so, so that a change to either the
 * control's own reporting or the schema's rule cannot quietly leave a broken
 * route saveable.
 */
describe('saving a stage whose destination is no longer reachable', () => {
  it('refuses a destination whose stage has left the interview', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
        order: ['stage-1', 'stage-2'],
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        'Skip destination stage "stage-3" does not exist.',
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('refuses a destination the interview now reaches first', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: configuredFields({ type: 'stage', stageId: 'stage-2' }),
        order: ['stage-2', 'stage-3', 'stage-1'],
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    expect(
      await screen.findByText(
        'Skip destination stage "stage-2" must come after the stage that references it.',
      ),
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('attributes the refusal to the destination, and to the stage that holds it', async () => {
    const session = createSession({
      fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
      order: ['stage-1', 'stage-2'],
    });

    const validation = await session.validate();

    // The path is the destination itself, not the stage or the skip logic
    // around it, so a host rendering issues against its own sections puts this
    // one on the control the researcher has to change.
    expect(validation).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ['stages', 0, 'skipLogic', 'destination', 'stageId'],
          message: 'Skip destination stage "stage-3" does not exist.',
          sectionId: sectionId({ kind: 'stage', stageId: 'stage-1' }),
        }),
      ]) as unknown,
    });
  });

  it('saves the same stage once the destination is chosen again', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
        order: ['stage-1', 'stage-2'],
      }),
    );

    // The refusal above is about the destination and nothing else: correcting
    // it is all it takes for the same stage to save.
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:stage:stage-2',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    expect(request.stageDocument.skipLogic).toMatchObject({
      destination: { type: 'stage', stageId: 'stage-2' },
    });
  });
});

describe('switching skip logic off', () => {
  it('removes it from the stage entirely', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderEditor(
      createSession({
        onFinish,
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
      }),
    );

    await switchOn(user);
    await user.click(screen.getByRole('button', { name: 'Clear skip logic' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    // Absent — not an object with an action and nothing else in it. The schema
    // has no way to spell half a skip logic, and a partial one would not
    // survive validation.
    expect(Object.hasOwn(request.stageDocument, 'skipLogic')).toBe(false);
  });

  it('asks first, and keeps everything when the answer is no', async () => {
    const user = setupUser();
    renderEditor(
      createSession({
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
      }),
    );
    await waitFor(() => expect(outlineItems()).toHaveLength(4));

    await switchOn(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Clear skip logic' }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole('radio', { name: 'Skip this stage' }),
    ).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
    ).toHaveValue('route:stage:stage-3');
    expect(outlineText()?.[2]).toBe('Skip logicFinished');
  });

  it('asks about a destination even when no rules have been created', async () => {
    const user = setupUser();
    renderEditor(createSession());

    await switchOn(user);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:finish',
    );
    await switchOn(user);

    // Where the interview continues is part of the skip logic, so switching
    // off destroys it too — the rules are not the only thing there is to lose.
    expect(
      await screen.findByRole('button', { name: 'Clear skip logic' }),
    ).toBeInTheDocument();
  });

  it('switches back on with an editable, empty rule set', async () => {
    const user = setupUser();
    renderEditor(
      createSession({
        fields: configuredFields({ type: 'stage', stageId: 'stage-3' }),
      }),
    );

    await switchOn(user);
    await user.click(screen.getByRole('button', { name: 'Clear skip logic' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Rules/ })).toBeNull(),
    );

    await switchOn(user);

    expect(
      await screen.findByRole('group', { name: /Rules/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add new skip logic rule' }),
    ).toBeEnabled();
    // The cleared rule does not come back with the section.
    expect(screen.queryByRole('button', { name: /^Delete rule:/ })).toBeNull();
  });
});

function ruleIds(request: FinishRequest): string[] {
  const skipLogic = request.stageDocument.skipLogic;
  if (typeof skipLogic !== 'object' || skipLogic === null) return [];
  const filter = Reflect.get(skipLogic, 'filter');
  if (typeof filter !== 'object' || filter === null) return [];
  const rules = Reflect.get(filter, 'rules');
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => String(Reflect.get(rule as object, 'id')));
}
