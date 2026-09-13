import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { RuleDraft } from '../rules/rule.ts';
import { NO_RULES_MESSAGE } from '../rules/ruleSet.ts';
import { useRuleSetValidation } from '../rules/useRuleSetValidation.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import { FilterRuleSetField, QueryRuleSetField } from './RuleSetField.tsx';

/** Where the schema keeps a stage's skip-logic rules, and its own filter. */
const SKIP_LOGIC_RULES = 'skipLogic.filter';
const FILTER_RULES = 'filter';

const SKIP_LOGIC_STAGE = sectionId({ kind: 'stage', stageId: 'information-1' });

/**
 * The skip-logic rule builder, mounted the way `SkipLogicSection` mounts it.
 *
 * The required message and the validation are the SECTION's, not the control's:
 * which rule set this is decides what its rules may be about, and the builder
 * cannot know. A story that left them out would show a rule builder that
 * refuses nothing.
 */
function SkipLogicRules() {
  const validation = useRuleSetValidation(SKIP_LOGIC_RULES, 'query');
  return (
    <Field<typeof QueryRuleSetField>
      name={SKIP_LOGIC_RULES}
      component={QueryRuleSetField}
      label="Rules"
      hint="Create one or more rules to determine when the action should occur."
      required={NO_RULES_MESSAGE}
      custom={validation}
    />
  );
}

/** The same builder narrowing a stage, as `NetworkFilterSection` mounts it. */
function StageFilterRules() {
  const validation = useRuleSetValidation(FILTER_RULES, 'filter');
  return (
    <Field<typeof FilterRuleSetField>
      name={FILTER_RULES}
      component={FilterRuleSetField}
      label="Filter rules"
      hint="Create one or more rules that must match in order for a node to be shown on this stage."
      required={NO_RULES_MESSAGE}
      custom={validation}
    />
  );
}

/**
 * Skip logic as the protocol would hold it: an action and a rule set together,
 * because the schema accepts no half of it.
 */
const holdingSkipLogic =
  (rules: readonly RuleDraft[], join?: string) => (host: InMemoryHost) => {
    const { document } = host.store.read(SKIP_LOGIC_STAGE);
    host.store.applyAsCollaborator(SKIP_LOGIC_STAGE, {
      ...document,
      skipLogic: {
        action: 'SKIP',
        filter: {
          ...(join === undefined ? {} : { join }),
          rules: [...rules],
        },
      },
    });
  };

/** Everyone over 65 the participant knows: two rules, so they must combine. */
const OLDER_THAN_65: RuleDraft = {
  id: 'rule-older',
  type: 'node',
  options: {
    type: 'person',
    attribute: 'age',
    operator: 'GREATER_THAN',
    value: 65,
  },
};

const KNOWS_SOMEBODY: RuleDraft = {
  id: 'rule-knows',
  type: 'edge',
  options: { type: 'knows', operator: 'EXISTS' },
};

const meta = {
  title: 'Protocol Builder/Fields/Rule builder',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Builds the rules that decide whether a stage runs at all, or which part of the interview network it works on. The whole set — the rules and how they combine — is one value of the stage, so the rules are written in a dialog and read back on the list as sentences. What a rule may be ABOUT belongs to the set rather than to the rule: skip logic can ask about the participant themselves, a stage filter cannot, and a rule that arrived some other way is marked on its own row rather than left for the protocol schema to refuse at the save. The codebook comes from the package’s subscription, so a type or attribute renamed elsewhere changes every sentence on the list as it lands.',
      },
    },
  },
  args: {
    stageId: 'information-1',
    sectionTitle: 'Skip logic',
    children: <SkipLogicRules />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the protocol holds it: skip logic switched on and nothing
 * written yet, which is where every rule set starts.
 */
export const NoRulesYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText('No rules have been created yet.'),
    ).toBeInTheDocument();
    // Named for its own set rather than "Add", because a stage editor commonly
    // shows this builder twice and the two would otherwise be one name read
    // down a list of buttons.
    await expect(
      canvas.getByRole('button', { name: 'Add new skip logic rule' }),
    ).toBeEnabled();
  },
};

/**
 * Two rules the stage holds. A second rule is what raises the question of how
 * they combine, so that control appears with it rather than standing there
 * unanswerable over a set of one.
 */
export const TheRulesAStageHolds: Story = {
  args: { seedEdit: holdingSkipLogic([OLDER_THAN_65, KNOWS_SOMEBODY], 'AND') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findAllByRole('button', { name: /^Edit rule:/ }),
    ).toHaveLength(2);
    await expect(
      canvas.getByRole('radio', { name: 'All rules must match' }),
    ).toBeChecked();
  },
};

/**
 * Writing a rule: what it is about, which type, whether it asks about that
 * type's presence or one of its attributes, and the comparison. The dialog is
 * where a rule is assembled, and the list is where it is read back.
 */
export const AddingARule: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Add new skip logic rule' }),
    );
    // The dialog is portalled out of the story root, so it is reached through
    // the document rather than the canvas.
    const dialog = await screen.findByRole('dialog', {
      name: 'Construct a Rule',
    });

    await userEvent.click(
      within(dialog).getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    // The types are the protocol's own, drawn as a participant will see them.
    await userEvent.click(
      await within(dialog).findByRole('radio', { name: 'person' }),
    );
    await userEvent.click(
      await within(dialog).findByRole('option', { name: /Presence/ }),
    );
    await userEvent.click(
      await within(dialog).findByRole('radio', { name: 'exists' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Finish and Close' }),
    );

    await waitFor(async () => {
      await expect(
        screen.queryByRole('dialog', { name: 'Construct a Rule' }),
      ).toBeNull();
    });

    // The rule reads as the sentence it is, and carries the controls that
    // reopen and delete it.
    await expect(
      await canvas.findByRole('button', { name: /^Edit rule:/ }),
    ).toBeInTheDocument();
    await expect(canvas.getByText('person')).toBeInTheDocument();
    await expect(canvas.getByText('exists')).toBeInTheDocument();
  },
};

/**
 * Held elsewhere: every rule is there to read, and none of them can be opened,
 * reordered or deleted. The rows stay rather than being replaced by a summary
 * — what the rules SAY is the thing a spectator came to read.
 */
export const ASpectator: Story = {
  args: {
    readOnly: true,
    seedEdit: holdingSkipLogic([OLDER_THAN_65, KNOWS_SOMEBODY], 'AND'),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const edits = await canvas.findAllByRole('button', {
      name: /^Edit rule:/,
    });
    for (const edit of edits) await expect(edit).toBeDisabled();
    await expect(
      canvas.getByRole('radio', { name: 'All rules must match' }),
    ).toBeDisabled();
  },
};

/**
 * Skip logic switched on and no rule written: the save is refused, because an
 * action with nothing to decide it would either always fire or never.
 *
 * The refusal arrives at the submit rather than while the researcher is still
 * deciding — the set's verdict is the section's `custom` validation, and a
 * form runs that when the stage is saved.
 */
export const TheSaveIsRefusedWithNoRules: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(
      await canvas.findByText('Please create at least one rule.'),
    ).toBeInTheDocument();
    await waitFor(async () => {
      await expect(
        canvas.getByRole('group', { name: /Rules/ }),
      ).toHaveAttribute('aria-invalid', 'true');
    });
    // And nothing was written: the refusal is what the researcher gets, not a
    // stage saved with skip logic that decides nothing.
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
  },
};

/**
 * The same builder narrowing a stage rather than deciding whether it runs.
 *
 * A filter's rules may only be about nodes and edges. An ego rule inside one is
 * degenerate — it keeps every entity or none — so the target is not offered at
 * all, rather than offered and refused afterwards.
 */
export const AFilterCannotAskAboutTheEgo: Story = {
  args: {
    stageId: 'name-generator-1',
    sectionTitle: 'Stage filter',
    children: <StageFilterRules />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Add new filter rule' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Construct a Rule',
    });

    await expect(
      within(dialog).getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    ).toBeInTheDocument();
    await expect(
      within(dialog).queryByRole('radio', {
        name: 'Ego - match one of the ego attributes.',
      }),
    ).toBeNull();
  },
};
