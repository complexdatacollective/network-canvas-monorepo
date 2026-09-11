import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';

import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  attributeField,
  openAttributePicker,
} from '../../testing/attributePicker.ts';
import type { InMemoryProtocolStore } from '../../testing/host/protocolStore.ts';
import type { RuleDraft } from '../rule.ts';
import type { RuleSetValue } from '../ruleSet.ts';
import { QueryRuleSetField } from '../RuleSetField.tsx';
import { RuleEditorHost } from './ruleEditorHost.tsx';

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

/**
 * The protocol this editor is opened over, with the stage carrying whatever
 * rules the test starts from.
 */
function ruleSections(
  options: Readonly<{
    /**
     * Typed as the record a stored rule IS rather than as a `RuleDraft`,
     * because the rules these tests are about are the ones no editor could
     * have written: a rule missing its target, or holding something that is
     * not a string there. A draft type cannot express either.
     */
    rules?: readonly Record<string, unknown>[];
    join?: string;
    sections?: Record<string, SectionDoc>;
  }> = {},
): Record<string, SectionDoc> {
  const filter =
    options.rules === undefined
      ? undefined
      : {
          ...(options.join === undefined ? {} : { join: options.join }),
          rules: [...options.rules],
        };
  const sections = options.sections ?? baseSections;

  return {
    ...sections,
    [stageSection]: {
      ...sections[stageSection],
      ...(filter === undefined ? {} : { skipLogic: { filter } }),
    },
  };
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

/**
 * The whole composition: a name and a label. No stage path, no selector, no
 * codebook prop, no host store.
 */
const ruleSetSection = (
  <BuilderSection title="Skip logic">
    <Field name={RULE_SET_FIELD} label="Rules" component={QueryRuleSetField} />
    <RuleSetProbe />
  </BuilderSection>
);

function renderEditor(sections: Record<string, SectionDoc> = ruleSections()) {
  let store: InMemoryProtocolStore | null = null;
  const view = render(
    <RuleEditorHost
      sections={sections}
      onStore={(built) => {
        store = built;
      }}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      {ruleSetSection}
    </RuleEditorHost>,
  );

  return {
    ...view,
    /** A change made somewhere other than this editor. */
    collaboratorWrites: (id: string, document: SectionDoc) =>
      act(() => {
        store?.applyAsCollaborator(sectionId(parseSectionId(id)), document);
      }),
  };
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

/**
 * The sentence one rule row actually reads, whitespace normalised.
 *
 * Taken from the element the row's own controls are named by, so this is the
 * text a researcher sees and a screen reader announces rather than a shape
 * assembled again by the test.
 */
const ruleRowSentence = (index = 0): string => {
  const trigger = screen.getAllByRole('button', { name: /^Edit rule:/ })[index];
  const previewId = trigger?.getAttribute('aria-labelledby')?.split(' ')[1];
  const preview =
    previewId === undefined ? null : document.getElementById(previewId);
  return (preview?.textContent ?? '').replace(/\s+/g, ' ').trim();
};

describe('the rule set field', () => {
  it('names itself from the field that renders it', () => {
    renderEditor(ruleSections());
    expect(screen.getByRole('group', { name: /Rules/ })).toBeInTheDocument();
  });

  it('offers the entity types the protocol context holds, with no codebook prop', async () => {
    const user = userEvent.setup();
    renderEditor(ruleSections());

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
    renderEditor(ruleSections());

    await openRuleEditor(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Ego - match one of the ego attributes.',
      }),
    );

    const picker = await openAttributePicker(
      user,
      await waitFor(() => attributeField('Ego attribute')),
    );
    expect(
      within(picker).getByRole('option', { name: 'EgoName' }),
    ).toBeInTheDocument();
  });

  it('adds a rule through the editor and shows it as a sentence', async () => {
    const user = userEvent.setup();
    renderEditor(ruleSections());

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
    renderEditor(ruleSections());

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
      ruleSections({
        join: 'AND',
        rules: [nodeRule('rule-a'), nodeRule('rule-b')],
      }),
    );

    const deleteControls = screen.getAllByRole('button', {
      name: /^Delete rule:/,
    });
    // One control per rule, which is what makes clicking the first of them a
    // deletion of the first rule rather than of whichever row happens to be
    // rendered.
    expect(deleteControls).toHaveLength(2);
    await user.click(deleteControls[0]!);
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
      ruleSections({
        join: 'AND',
        rules: [nodeRule('rule-a'), nodeRule('rule-b')],
      }),
    );

    const handle = await screen.findByRole('button', {
      name: 'Reorder item 1 of 2',
    });
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
      ruleSections({ rules: [nodeRule('rule-a'), nodeRule('rule-b')] }),
    );

    await user.click(screen.getByRole('radio', { name: 'Any rule can match' }));

    await waitFor(() => expect(probedRuleSet()?.join).toBe('OR'));
    expect(probedRuleSet()?.rules?.map((rule) => rule.id)).toEqual([
      'rule-a',
      'rule-b',
    ]);
  });

  it('does not offer a combination for a single rule', () => {
    renderEditor(ruleSections({ rules: [nodeRule('rule-a')] }));
    expect(
      screen.queryByRole('radio', { name: 'Any rule can match' }),
    ).toBeNull();
  });
});

describe('a stored rule about whether an attribute was answered', () => {
  /**
   * The editor no longer offers these operators against an attribute, but
   * protocols authored before it stopped still hold them and have to read
   * correctly. Architect renders them "Person where Age" / "Person without
   * Age": the operator introduces the attribute rather than following it.
   */
  const attributePresenceRule = (operator: string): RuleDraft => ({
    id: 'rule-a',
    type: 'node',
    options: { type: 'person', attribute: 'age', operator },
  });

  it('reads it as one phrase rather than repeating the operator', () => {
    renderEditor(ruleSections({ rules: [attributePresenceRule('EXISTS')] }));

    expect(ruleRowSentence()).toBe('Person where Age');
  });

  it('reads its negative the same way', () => {
    renderEditor(
      ruleSections({ rules: [attributePresenceRule('NOT_EXISTS')] }),
    );

    expect(ruleRowSentence()).toBe('Person without Age');
  });
});

describe('rules the codebook can no longer account for', () => {
  it('reports a deleted attribute on the rule, without throwing', () => {
    renderEditor(
      ruleSections({
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
    renderEditor(ruleSections({ rules: [nodeRule('rule-a', 'ghost')] }));

    expect(
      screen.getByText(
        'This rule refers to a node type that is no longer in the codebook. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
  });

  it('reports an operator a rule about presence cannot use', () => {
    renderEditor(
      ruleSections({
        rules: [
          {
            id: 'rule-a',
            type: 'node',
            // No attribute, so the only operators the schema allows are the
            // two that ask whether the type is there. An imported or
            // hand-edited protocol can hold this, and nothing else marks it
            // before the whole stage is saved.
            options: { type: 'person', operator: 'EXACTLY', value: 3 },
          },
        ],
      }),
    );

    expect(
      screen.getByText(
        'This rule asks whether an entity type is present, but uses an operator that cannot ask that. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    // The rule still reads, so the researcher can see which one to fix.
    expect(ruleRowSentence()).toBe('Person exactly 3');
  });

  /**
   * The one part of a rule no control on screen asks for. Both branches of
   * `filterRuleSchema` require `id: z.string()`, so a rule without one is
   * refused when the whole stage is saved — by an issue naming a position in
   * an array, long after the row that holds it has scrolled past.
   */
  it('reports a rule that has no identifier', () => {
    renderEditor(
      ruleSections({
        rules: [
          // Every part the editor asks for is answered; the id is not there.
          { type: 'node', options: { type: 'person', operator: 'EXISTS' } },
        ],
      }),
    );

    expect(
      screen.getByText(
        'This rule has no identifier, so this protocol cannot be saved with it. Edit the rule to give it one, or delete the rule.',
      ),
    ).toBeInTheDocument();
    // And still reads, so the researcher can see which one to open.
    expect(ruleRowSentence()).toBe('Person exists');
  });
});

/**
 * A rule's id is the identity the LIST is keyed by, and the protocol schema
 * refuses a set holding the same one twice (`findDuplicateId`). Two rows
 * sharing an id therefore have to be two rows: keying both by the duplicate
 * collapsed them into one, so deleting either deleted both and editing the
 * second edited and displayed the first.
 */
describe('two stored rules that share an identifier', () => {
  const SHARED_ID_MESSAGE =
    'Another rule in this set has the same identifier, so this protocol cannot be saved with both. Edit or delete the rule.';

  /** Two rules that read differently, so the rows can be told apart. */
  const sharingOneId = (): Record<string, unknown>[] => [
    {
      id: 'rule-a',
      type: 'node',
      options: { type: 'person', operator: 'EXISTS' },
    },
    {
      id: 'rule-a',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'age',
        operator: 'EXACTLY',
        value: 30,
      },
    },
  ];

  it('shows both rules, and marks both', () => {
    renderEditor(ruleSections({ join: 'AND', rules: sharingOneId() }));

    // Two rows, each reading its own rule — not one row rendered twice.
    expect(screen.getAllByRole('button', { name: /^Edit rule:/ })).toHaveLength(
      2,
    );
    expect(ruleRowSentence(0)).toBe('Person exists');
    expect(ruleRowSentence(1)).toBe('Person where Age is exactly equal to 30');
    expect(screen.getAllByText(SHARED_ID_MESSAGE)).toHaveLength(2);
  });

  it('deletes exactly one of them', async () => {
    const user = userEvent.setup();
    renderEditor(ruleSections({ join: 'AND', rules: sharingOneId() }));

    await user.click(
      screen.getAllByRole('button', { name: /^Delete rule:/ })[0]!,
    );
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(probedRuleSet()?.rules).toHaveLength(1));
    // The one that survives is the one that was not deleted, and it is no
    // longer sharing its id with anything.
    expect(probedRuleSet()?.rules?.[0]?.options).toMatchObject({
      attribute: 'age',
    });
    expect(screen.queryByText(SHARED_ID_MESSAGE)).toBeNull();
  });

  it('keeps two rules whose identifier is not a string apart as well', async () => {
    const user = userEvent.setup();
    renderEditor(
      ruleSections({
        join: 'AND',
        rules: [
          {
            id: 3,
            type: 'node',
            options: { type: 'person', operator: 'EXISTS' },
          },
          {
            id: 3,
            type: 'node',
            options: {
              type: 'person',
              attribute: 'age',
              operator: 'EXACTLY',
              value: 30,
            },
          },
        ],
      }),
    );

    // The schema requires a string, so both are reported as having no
    // identifier at all rather than as sharing one — and neither may key a
    // row, or they would collide exactly as two shared strings do.
    expect(screen.getAllByText(/^This rule has no identifier/)).toHaveLength(2);

    await user.click(
      screen.getAllByRole('button', { name: /^Delete rule:/ })[0]!,
    );
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(probedRuleSet()?.rules).toHaveLength(1));
    expect(probedRuleSet()?.rules?.[0]?.options).toMatchObject({
      attribute: 'age',
    });
  });

  it('gives one of them a new identifier when it is edited and saved', async () => {
    const user = userEvent.setup();
    renderEditor(ruleSections({ join: 'AND', rules: sharingOneId() }));

    await user.click(
      screen.getAllByRole('button', { name: /^Edit rule:/ })[1]!,
    );
    await screen.findByRole('dialog', { name: 'Construct a Rule' });
    await user.click(screen.getByRole('button', { name: 'Finish and Close' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Construct a Rule' }),
      ).toBeNull(),
    );

    // The rule the researcher opened is the rule that was saved — the second
    // one, not the first the shared id used to resolve to — and it comes back
    // filed under an id of its own.
    const saved = probedRuleSet()?.rules ?? [];
    expect(saved.map((rule) => rule.options?.attribute)).toEqual([
      undefined,
      'age',
    ]);
    expect(saved[0]?.id).toBe('rule-a');
    expect(saved[1]?.id).toEqual(expect.any(String));
    expect(saved[1]?.id).not.toBe('rule-a');
    expect(screen.queryByText(SHARED_ID_MESSAGE)).toBeNull();
  });
});

/**
 * The part of a rule that says whether it is about a node, an edge or the ego.
 * A protocol authored elsewhere can arrive without it, or with something that
 * is not a string there, and `describeRule` reports both as an unreadable
 * target — while the field tells the researcher to open rule 1. The row it
 * names has to BE there, with the controls that open and delete it: the rule
 * set has no other affordance that reaches a row by position, so a hidden row
 * left the whole set unrepairable except by clearing it.
 */
describe('a stored rule that does not say what it is about', () => {
  it.each([
    {
      what: 'no target at all',
      rule: { id: 'rule-a', options: { type: 'person', operator: 'EXISTS' } },
    },
    {
      what: 'a target that is not a string',
      rule: {
        id: 'rule-a',
        type: 3,
        options: { type: 'person', operator: 'EXISTS' },
      },
    },
  ])(
    'shows the row for a rule with $what, and its controls',
    async ({ rule }) => {
      const user = userEvent.setup();
      renderEditor(ruleSections({ rules: [rule] }));

      expect(
        screen.getByText(
          'This rule does not say whether it is about a node, an edge, or the ego. Edit or delete the rule.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^Delete rule:/ }),
      ).toBeInTheDocument();

      // And the edit control opens the editor the field told them to open,
      // where the target question is asked again.
      await user.click(screen.getByRole('button', { name: /^Edit rule:/ }));
      expect(
        await screen.findByRole('dialog', { name: 'Construct a Rule' }),
      ).toBeInTheDocument();
    },
  );
});

describe('a codebook that changes underneath the editor', () => {
  it('renames an entity type in every rule that names it', async () => {
    const harness = renderEditor(ruleSections({ rules: [nodeRule('rule-a')] }));

    expect(screen.getByText('Person')).toBeInTheDocument();

    harness.collaboratorWrites(personSection, {
      ...personDefinition,
      name: 'Participant',
    });

    expect(await screen.findByText('Participant')).toBeInTheDocument();
    expect(screen.queryByText('Person')).toBeNull();
  });

  it('offers an entity type a collaborator adds while the editor is open', async () => {
    const user = userEvent.setup();
    const harness = renderEditor();

    await openRuleEditor(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    expect(await screen.findByRole('radio', { name: 'Person' })).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Place' })).toBeNull();

    harness.collaboratorWrites(placeSection, {
      name: 'Place',
      color: 'node-color-seq-3',
      shape: { default: 'circle' },
    });

    expect(
      await screen.findByRole('radio', { name: 'Place' }),
    ).toBeInTheDocument();
  });

  it('reports a rule whose attribute a collaborator has just retyped', async () => {
    const harness = renderEditor(
      ruleSections({
        rules: [
          {
            id: 'rule-a',
            type: 'node',
            options: {
              type: 'person',
              attribute: 'age',
              operator: 'EXACTLY',
              value: 30,
            },
          },
        ],
      }),
    );

    expect(screen.queryByText(/no longer/)).toBeNull();

    harness.collaboratorWrites(personSection, {
      ...personDefinition,
      variables: {
        // `EXACTLY` survives the retype — it is legal for both types — so the
        // operator check has nothing to say, and the operand left behind is a
        // number where the runtime now compares a list.
        age: {
          name: 'Age',
          type: 'categorical',
          options: [
            { label: 'Young', value: 30 },
            { label: 'Old', value: 60 },
          ],
        },
      },
    });

    expect(
      await screen.findByText(
        'This rule compares its attribute against a value of the wrong kind for the attribute’s type. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
  });

  it('reports a rule whose attribute a collaborator has just deleted', async () => {
    const harness = renderEditor(
      ruleSections({
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
      }),
    );

    expect(screen.getByText('Mood')).toBeInTheDocument();
    expect(screen.getByText('Happy')).toBeInTheDocument();

    harness.collaboratorWrites(personSection, {
      ...personDefinition,
      variables: { age: { name: 'Age', type: 'number' } },
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
