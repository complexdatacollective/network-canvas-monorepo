import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { RuleDraft } from '../../../rules/rule.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  type CodebookPatch,
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import BuilderSection from '../../BuilderSection.tsx';
import InterviewerGuidanceSection from '../../interviewer-guidance/InterviewerGuidanceSection.tsx';
import StageNameSection from '../../stage-heading/StageNameSection.tsx';
import SkipLogicSection from '../SkipLogicSection.tsx';

/**
 * The stage most of these open: the third of the fixture's nineteen, and the
 * simplest one there is — a name, a heading and the blocks under it.
 */
const STAGE = loadFixtureStage('information-1');

/**
 * The stage the destination tests open instead: the fifteenth of nineteen, so
 * every destination it may offer fits in one assertion and the fourteen stages
 * before it are all there to be left out of it.
 */
const LATE_STAGE = loadFixtureStage('narrative-1');

const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const nodeRule = (id: string): RuleDraft => ({
  id,
  type: 'node',
  options: { type: 'person', operator: 'EXISTS' },
});

/** The stage under test, with these keys written over the fixture's own. */
const stageHolding = (fields: SectionDoc) => ({
  id: STAGE.id,
  type: STAGE.type,
  fields: { ...STAGE.fields, ...fields },
});

const lateStageHolding = (fields: SectionDoc) => ({
  id: LATE_STAGE.id,
  type: LATE_STAGE.type,
  fields: { ...LATE_STAGE.fields, ...fields },
});

/**
 * The composition under test: the three sections every stage editor has, plus
 * one stage-specific section between them, in the order every editor uses.
 */
const editorSections = (
  <>
    <StageNameSection position={{ index: 3, total: 19 }} />
    <BuilderSection title="Page content">
      <Field name="title" label="Page heading" component={InputField} />
    </BuilderSection>
    <SkipLogicSection />
    <InterviewerGuidanceSection />
  </>
);

/**
 * The same editor with nothing in it but the section under test.
 *
 * Every event re-renders every section the editor holds, and the sections
 * around this one are what the outline tests are for — a chain that never
 * touches them pays for them anyway. Used only where the assertions are about
 * the section itself; anything about how the section sits among the others
 * mounts the whole composition.
 */
const skipLogicOnly = <SkipLogicSection />;

const skipLogicSwitch = () =>
  screen.getByRole('switch', { name: 'Skip logic' });

/**
 * Switch the section on, and wait for the panel that opens.
 *
 * Opening is asynchronous from end to end: `BuilderSection` answers Fresco's
 * `Section` with a promise, and the section sets its own open state only once
 * that promise has settled. So the click resolving is not the panel being on
 * screen — one macrotask anywhere in that chain, which is what a loaded CI
 * runner supplies, puts the whole panel after it. Waited for here rather than
 * at each call site, because a caller cannot read a control out of a panel
 * this has not returned from.
 */
const switchOn = async (harness: StageEditorHarness) => {
  await harness.user.click(skipLogicSwitch());
  await screen.findByRole('radio', { name: 'Skip this stage' });
};

/**
 * Switch the section off, and wait for the click to have been answered.
 *
 * Either answer will do, because which one arrives is what the test around
 * this asserts: a section holding something asks before it clears it, and one
 * holding nothing simply closes.
 */
const switchOff = async (harness: StageEditorHarness) => {
  await harness.user.click(skipLogicSwitch());
  await waitFor(() => {
    const asked =
      screen.queryByRole('button', { name: 'Clear skip logic' }) !== null;
    const closed =
      screen.queryByRole('radio', { name: 'Skip this stage' }) === null;
    expect(asked || closed).toBe(true);
  });
};

const configuredFields = (
  destination?: Record<string, unknown>,
): SectionDoc => ({
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
const awaitingRulesFields: SectionDoc = {
  skipLogic: {
    action: 'SKIP',
    destination: { type: 'stage', stageId: 'name-generator-1' },
    filter: { rules: [] },
  },
};

/**
 * The codebook's Person holding exactly these attributes instead of its own,
 * as a change made somewhere other than this editor.
 */
const personWith = (
  harness: StageEditorHarness,
  variables: Record<string, unknown>,
): CodebookPatch => ({
  node: {
    person: { ...harness.protocolSections()[personSection], variables },
  },
});

const skipLogicOutline = (harness: StageEditorHarness) =>
  harness.outline().find((section) => section.title === 'Skip logic');

describe('a stage editor composing the skip-logic section', () => {
  it('lists it between the stage-specific sections and interviewer guidance', async () => {
    const harness = renderStageEditor({
      stageId: STAGE.id,
      sections: editorSections,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(harness.outline()).toEqual([
      { title: 'Stage name', state: 'Finished' },
      { title: 'Page content', state: 'Finished' },
      { title: 'Skip logic', state: 'Switched off' },
      { title: 'Interviewer guidance', state: 'Switched off' },
    ]);
  });

  it('opens already configured skip logic and reports it as finished', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(
        configuredFields({ type: 'stage', stageId: 'name-generator-1' }),
      ),
      sections: editorSections,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(skipLogicOutline(harness)?.state).toBe('Finished');
    expect(
      screen.getByRole('radio', { name: 'Skip this stage' }),
    ).toBeChecked();
  });

  it('reports a switched-on section whose required fields are empty as unfinished', async () => {
    const harness = renderStageEditor({
      stageId: STAGE.id,
      sections: editorSections,
    });
    await waitFor(() => expect(harness.outline()).toHaveLength(4));

    await switchOn(harness);

    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Not finished'),
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
    const harness = renderStageEditor({
      stageId: STAGE.id,
      sections: editorSections,
    });

    await switchOn(harness);
    await harness.user.click(
      screen.getByRole('radio', { name: 'Skip this stage' }),
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:stage:name-generator-1',
    );

    expect(
      screen.getByRole('radio', { name: 'Skip this stage' }),
    ).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
    ).toHaveValue('route:stage:name-generator-1');
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
    const harness = renderStageEditor({
      stage: stageHolding(awaitingRulesFields),
      sections: skipLogicOnly,
    });

    await harness.user.click(
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
    const harness = renderStageEditor({
      stage: stageHolding(configuredFields()),
      sections: editorSections,
    });

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:stage:name-generator-1',
    );

    // The save runs the stage's own schema over the document before handing it
    // to the protocol, so a stage that comes back is one the schema accepts.
    const written = await harness.submit();
    expect(written?.stageDocument.skipLogic).toEqual({
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
      destination: { type: 'stage', stageId: 'name-generator-1' },
    });
  });
});

describe('the rules inside skip logic', () => {
  const twoRuleFields: SectionDoc = {
    skipLogic: {
      action: 'SHOW',
      filter: { join: 'AND', rules: [nodeRule('rule-a'), nodeRule('rule-b')] },
    },
  };

  it('keeps the surviving rule when one is deleted', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(twoRuleFields),
      sections: editorSections,
    });

    const [firstDelete] = screen.getAllByRole('button', {
      name: /^Delete rule:/,
    });
    await harness.user.click(firstDelete as HTMLElement);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete' }),
    );

    const written = await harness.submit();
    expect(written).not.toBeNull();
    expect(ruleIds(written?.stageDocument)).toEqual(['rule-b']);
  });

  it('moves a rule without changing which rule it is', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(twoRuleFields),
      sections: editorSections,
    });

    (
      await screen.findByRole('button', { name: 'Reorder item 1 of 2' })
    ).focus();
    await harness.user.keyboard('{ArrowDown}');

    const written = await harness.submit();
    expect(written).not.toBeNull();
    expect(ruleIds(written?.stageDocument)).toEqual(['rule-b', 'rule-a']);
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

  it('refuses two rules that never said how they combine', async () => {
    const harness = renderStageEditor({
      stage: stageHolding({
        // Two rules and no join: the shape the schema rejects with "Too big:
        // expected array to have <=1 items".
        skipLogic: {
          action: 'SHOW',
          filter: { rules: [nodeRule('rule-a'), nodeRule('rule-b')] },
        },
      }),
      sections: editorSections,
    });

    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        'Please choose how these rules should be combined.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Rules/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('refuses a rule set the researcher has emptied', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(
        configuredFields({ type: 'stage', stageId: 'name-generator-1' }),
      ),
      sections: editorSections,
    });
    await waitFor(() => expect(harness.outline()).toHaveLength(4));

    await harness.user.click(
      screen.getByRole('button', { name: /^Delete rule:/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete' }),
    );

    // An empty rule set still looks like an answer to the form, so nothing but
    // this check stands between it and the schema's "Too small" refusal.
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText('Please create at least one rule.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Rules/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
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
    const harness = renderStageEditor({
      stage: stageHolding({
        skipLogic: {
          action: 'SHOW',
          filter: {
            rules: [
              {
                id: 'rule-a',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'relationship_to_ego',
                  operator: 'CONTAINS',
                  // An unterminated character class.
                  value: '[unclosed',
                },
              },
            ],
          },
        },
      }),
      sections: editorSections,
    });

    expect(
      await screen.findByText(
        'This rule compares its attribute against a pattern that is not a valid regular expression, so the interview cannot apply the rule. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        'Rule 1 cannot be used as it stands. Open it to fix it, or delete it.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * A datetime attribute records answers at ONE resolution, and retyping it is
   * an ordinary codebook edit made by someone who cannot see this rule. The
   * operand is still a string, still the shape the schema and the operand
   * table ask for, and can never equal an answer again.
   *
   * The fixture's codebook holds no date attribute, so one arrives here the
   * way every attribute does — from an edit made outside this editor — and the
   * rule is proved sound against it before the retype that breaks it.
   */
  it('refuses a rule whose date the attribute can no longer record', async () => {
    const harness = renderStageEditor({
      stage: stageHolding({
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
      }),
      sections: editorSections,
    });

    harness.receiveCodebookUpdate(
      personWith(harness, {
        born: {
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'full' },
        },
      }),
    );
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Finished'),
    );

    harness.receiveCodebookUpdate(
      personWith(harness, {
        // The attribute is still a datetime and the operator is still legal
        // for one. Only the dates it records have changed.
        born: {
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year' },
        },
      }),
    );

    expect(
      await screen.findByText(
        'This rule compares its attribute against “2020-05-14”, but the attribute is now answered with a year. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
  });

  it('refuses a rule whose attribute a collaborator has deleted', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(attributeRuleFields),
      sections: editorSections,
    });
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Finished'),
    );

    harness.receiveCodebookUpdate(personWith(harness, {}));

    // On the row, where the researcher can act on it, and in the outline, so
    // the section stops claiming to be finished.
    expect(
      await screen.findByText(
        'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
  });

  it('refuses a rule whose operator the attribute’s new type does not allow', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(attributeRuleFields),
      sections: editorSections,
    });
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Finished'),
    );

    // The attribute is still there; comparing text with "greater than" is not
    // something the schema accepts.
    harness.receiveCodebookUpdate(
      personWith(harness, { age: { name: 'Age', type: 'text' } }),
    );

    expect(
      await screen.findByText(
        'This rule uses an operator that is not valid for its attribute type. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
  });

  it('refuses a rule naming an option a collaborator has renamed', async () => {
    const harness = renderStageEditor({
      stage: stageHolding({
        skipLogic: {
          action: 'SHOW',
          filter: {
            rules: [
              {
                id: 'rule-a',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'contactType',
                  operator: 'INCLUDES',
                  value: ['call'],
                },
              },
            ],
          },
        },
      }),
      sections: editorSections,
    });
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Finished'),
    );

    harness.receiveCodebookUpdate(
      personWith(harness, {
        // The attribute is still a categorical and the operator is still legal
        // for one. Only the option this rule names has gone.
        contactType: {
          name: 'contactType',
          type: 'categorical',
          options: [
            { label: 'Not working', value: 'not-working' },
            { label: 'Text message', value: 'text' },
          ],
        },
      }),
    );

    expect(
      await screen.findByText(
        'This rule compares its attribute against an option that is no longer one of that attribute’s choices. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
  });

  it('opens a stage whose stored rule already names a missing option', async () => {
    // The deployed-protocol case, and the reason membership is an editor rule
    // rather than a load-time error (ruling on issue #1548): the shared
    // validator accepts this protocol, so the editor is what has to open it,
    // show the researcher the rule, and refuse the save.
    const harness = renderStageEditor({
      stage: stageHolding({
        skipLogic: {
          action: 'SHOW',
          filter: {
            rules: [
              {
                id: 'rule-a',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'contactType',
                  operator: 'INCLUDES',
                  value: ['retired'],
                },
              },
            ],
          },
        },
      }),
      sections: editorSections,
    });

    // The rule is on screen and readable, with the option it names printed as
    // the bare value the codebook has no label for — reporting a rule is not
    // refusing to show it.
    const row = await screen.findByRole('button', { name: /^Edit rule:/ });
    expect(row).toHaveAccessibleName(/contactType.*includes.*retired/s);
    expect(
      screen.getByText(
        'This rule compares its attribute against an option that is no longer one of that attribute’s choices. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        "Rule 1 no longer works with this protocol's codebook. Open it to fix it, or delete it.",
      ),
    ).toBeInTheDocument();
  });

  /**
   * The protocol schema refuses a filter whose rules repeat an id
   * (`findDuplicateId`), and no control here asks for one — so a stage holding
   * two rules under one id can only have arrived by import, by hand-editing,
   * or from a merge. Nothing used to report it, and the list keyed both rows
   * by that one id, which made them one row to `ArrayField`.
   */
  it('refuses a stage whose rules share an identifier', async () => {
    const harness = renderStageEditor({
      stage: stageHolding({
        skipLogic: {
          action: 'SHOW',
          filter: {
            join: 'AND',
            rules: [
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
            ],
          },
        },
      }),
      sections: editorSections,
    });

    // Both rows are there, and both are marked: neither is the wrong one.
    expect(
      await screen.findAllByRole('button', { name: /^Edit rule:/ }),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        'Another rule in this set has the same identifier, so this protocol cannot be saved with both. Edit or delete the rule.',
      ),
    ).toHaveLength(2);
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        '2 of these rules cannot be used as they stand. Open each marked rule to fix it, or delete it.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The rule dialog refuses every gap, so a rule with no operand cannot have
   * been built here: it arrived by import, by hand-editing, or from somebody
   * else's editor. The protocol schema accepts it — `value` is optional there — and
   * the interview then runs `EXACTLY` with nothing to compare, which is a
   * presence test the researcher never wrote. The editor is the only thing
   * that can say so.
   */
  it('refuses a stored rule whose operator was never given its operand', async () => {
    const harness = renderStageEditor({
      stage: stageHolding({
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
      }),
      sections: editorSections,
    });

    // On the row, where the researcher can act on it, and in the outline, so
    // the section stops claiming to be finished.
    expect(
      await screen.findByText(
        'This rule is not complete. Edit it to fill in every part, or delete it.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(skipLogicOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        'Rule 1 is not finished. Open it to fill in every part, or delete it.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for the rules a switched-on skip logic has none of', async () => {
    const harness = renderStageEditor({
      stageId: STAGE.id,
      sections: editorSections,
    });

    await switchOn(harness);
    await harness.user.click(
      screen.getByRole('radio', { name: 'Skip this stage' }),
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:finish',
    );

    expect(await harness.submit()).toBeNull();

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
  });
});

describe('choosing where the interview continues', () => {
  const destinationSelect = () =>
    screen.getByRole('combobox', { name: 'When this stage is skipped' });

  const destinationOptions = () =>
    within(destinationSelect())
      .getAllByRole('option')
      .map((option) => option.textContent);

  it('offers only the stages that come after this one', () => {
    renderStageEditor({
      stage: lateStageHolding(configuredFields()),
      sections: skipLogicOnly,
    });

    // The fourteen stages before this one are not among them, and each of the
    // four that are is numbered where the researcher will find it.
    expect(destinationOptions()).toEqual([
      'Next available stage',
      'Stage 16 — Family Pedigree',
      'Stage 17 — Narrative Pedigree',
      'Stage 18 — Network Composer',
      'Stage 19 — Geospatial',
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
    renderStageEditor({
      create: {
        type: STAGE.type,
        // Between the seventeenth and the eighteenth stage, counting from zero.
        position: 17,
        fields: { ...STAGE.fields, ...configuredFields() },
      },
      sections: skipLogicOnly,
    });

    expect(destinationOptions()).toEqual([
      'Next available stage',
      // The stage this one displaces comes after it, and it and the stage
      // beyond it are both numbered one higher than they are today.
      'Stage 19 — Network Composer',
      'Stage 20 — Geospatial',
      'End the interview',
    ]);
  });

  /**
   * Whether the destination still exists is a fact about ANOTHER section, so
   * it is reported and the save goes through: a draft is allowed to be
   * transiently invalid across sections, and publication is where that is
   * enforced. Both halves are asserted here, because either on its own would
   * hold while the other broke — a save silently refused with the problem on
   * screen, or a save taken with nothing to tell the researcher why the stage
   * they authored no longer skips anywhere.
   */
  it('reports a destination whose stage has left the interview, and saves it', async () => {
    const harness = renderStageEditor({
      stage: lateStageHolding(
        configuredFields({ type: 'stage', stageId: 'deleted-stage' }),
      ),
      sections: skipLogicOnly,
    });

    expect(
      screen.getByText(
        'The stage this skips to is no longer part of this interview. Choose where the interview should continue instead.',
      ),
    ).toBeInTheDocument();
    // The problem is a property of this destination, so it is described to
    // assistive technology by the control that holds it — and the control is
    // marked invalid, so it is not merely described as broken while still
    // reading as an acceptable answer.
    expect(destinationSelect()).toHaveAccessibleDescription(
      /no longer part of this interview/,
    );
    expect(destinationSelect()).toHaveAttribute('aria-invalid', 'true');

    const written = await harness.submit();
    expect(written?.stageDocument.skipLogic).toEqual(
      configuredFields({ type: 'stage', stageId: 'deleted-stage' }).skipLogic,
    );
  });

  it('leaves a destination the interview can still reach marked valid', () => {
    renderStageEditor({
      stage: lateStageHolding(
        configuredFields({ type: 'stage', stageId: 'geospatial-1' }),
      ),
      sections: skipLogicOnly,
    });

    expect(destinationSelect()).not.toHaveAttribute('aria-invalid', 'true');
  });

  /**
   * A destination with no stage named is a destination the protocol schema
   * refuses, and absence is how "continue at the next available stage" is
   * spelled — so reading the two the same way left the control claiming the
   * interview continued at the next stage while the save was refused for a
   * destination the researcher was never shown.
   */
  it('reports a destination it cannot read, rather than showing the next stage', async () => {
    renderStageEditor({
      stage: lateStageHolding(configuredFields({ type: 'stage' })),
      sections: skipLogicOnly,
    });

    expect(
      await screen.findByText(
        'The stage this skips to cannot be read. Choose where the interview should continue instead.',
      ),
    ).toBeInTheDocument();
    expect(destinationSelect()).toHaveAttribute('aria-invalid', 'true');
    expect(destinationSelect()).not.toHaveValue('route:next');
  });

  /**
   * The same gap on its other axis. The schema's two destination shapes are
   * `strictObject`s, so a stray key beside a valid discriminator is a
   * destination it refuses — and a reader that took the discriminator and
   * dropped the rest showed "End the interview" as a finished answer over a
   * stored value that could not be saved.
   */
  it('reports a destination carrying a key the schema refuses', async () => {
    renderStageEditor({
      stage: lateStageHolding(
        configuredFields({ type: 'finish', stageId: 'stale' }),
      ),
      sections: skipLogicOnly,
    });

    expect(
      await screen.findByText(
        'The stage this skips to cannot be read. Choose where the interview should continue instead.',
      ),
    ).toBeInTheDocument();
    expect(destinationSelect()).toHaveAttribute('aria-invalid', 'true');
    expect(destinationSelect()).not.toHaveValue('route:finish');
  });

  /**
   * Reporting is not refusing: the control says which answer to change, and
   * the stage's own schema is what stops the stage being saved. Both have to
   * be true, or the researcher meets a refusal with no control to point at.
   */
  it('refuses to save a destination carrying a key the schema refuses', async () => {
    const harness = renderStageEditor({
      stage: lateStageHolding(
        configuredFields({ type: 'finish', stageId: 'stale' }),
      ),
      sections: skipLogicOnly,
    });

    expect(await harness.submit()).toBeNull();
    expect(destinationSelect()).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses to save a destination that names no stage', async () => {
    const harness = renderStageEditor({
      stage: lateStageHolding(configuredFields({ type: 'stage' })),
      sections: skipLogicOnly,
    });

    expect(await harness.submit()).toBeNull();
    expect(destinationSelect()).toHaveAttribute('aria-invalid', 'true');
  });

  it('reports a destination the interview now reaches first, and saves it', async () => {
    const harness = renderStageEditor({
      stage: lateStageHolding(
        // The interview reaches the Information stage long before this one.
        configuredFields({ type: 'stage', stageId: 'information-1' }),
      ),
      sections: skipLogicOnly,
    });

    expect(
      screen.getByText(
        'The stage this skips to no longer comes after this one. Choose a later stage, or end the interview.',
      ),
    ).toBeInTheDocument();
    expect(destinationSelect()).toHaveAttribute('aria-invalid', 'true');

    const written = await harness.submit();
    expect(written?.stageDocument.skipLogic).toEqual(
      configuredFields({ type: 'stage', stageId: 'information-1' }).skipLogic,
    );
  });

  it('saves the same stage once the destination is chosen again', async () => {
    const harness = renderStageEditor({
      stage: lateStageHolding(
        configuredFields({ type: 'stage', stageId: 'deleted-stage' }),
      ),
      sections: skipLogicOnly,
    });

    await harness.user.selectOptions(
      destinationSelect(),
      'route:stage:geospatial-1',
    );

    const written = await harness.submit();
    expect(written?.stageDocument.skipLogic).toMatchObject({
      destination: { type: 'stage', stageId: 'geospatial-1' },
    });
  });
});

describe('switching skip logic off', () => {
  it('removes it from the stage entirely', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(
        configuredFields({ type: 'stage', stageId: 'name-generator-1' }),
      ),
      sections: editorSections,
    });

    await switchOff(harness);
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear skip logic' }),
    );

    const written = await harness.submit();
    expect(written).not.toBeNull();
    // Absent — not an object with an action and nothing else in it. The schema
    // has no way to spell half a skip logic, and a partial one would not
    // survive validation.
    expect(Object.hasOwn(written?.stageDocument ?? {}, 'skipLogic')).toBe(
      false,
    );
  });

  it('asks first, and keeps everything when the answer is no', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(
        configuredFields({ type: 'stage', stageId: 'name-generator-1' }),
      ),
      sections: editorSections,
    });
    await waitFor(() => expect(harness.outline()).toHaveLength(4));

    await switchOff(harness);
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));

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
    ).toHaveValue('route:stage:name-generator-1');
    expect(skipLogicOutline(harness)?.state).toBe('Finished');
  });

  it('asks about a destination even when no rules have been created', async () => {
    const harness = renderStageEditor({
      stageId: STAGE.id,
      sections: editorSections,
    });

    await switchOn(harness);
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'When this stage is skipped' }),
      'route:finish',
    );
    await switchOff(harness);

    // Where the interview continues is part of the skip logic, so switching
    // off destroys it too — the rules are not the only thing there is to lose.
    expect(
      await screen.findByRole('button', { name: 'Clear skip logic' }),
    ).toBeInTheDocument();
  });

  it('switches back on with an editable, empty rule set', async () => {
    const harness = renderStageEditor({
      stage: stageHolding(
        configuredFields({ type: 'stage', stageId: 'name-generator-1' }),
      ),
      sections: editorSections,
    });

    await switchOff(harness);
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear skip logic' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Rules/ })).toBeNull(),
    );

    await switchOn(harness);

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

function ruleIds(stage: SectionDoc | undefined): string[] {
  const skipLogic = stage?.skipLogic;
  if (typeof skipLogic !== 'object' || skipLogic === null) return [];
  const filter = Reflect.get(skipLogic, 'filter');
  if (typeof filter !== 'object' || filter === null) return [];
  const rules = Reflect.get(filter, 'rules');
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => String(Reflect.get(rule as object, 'id')));
}
