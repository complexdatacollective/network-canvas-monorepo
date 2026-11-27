import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { ConditionDraft } from '../../localization/conditionText.ts';
import {
  attributeField,
  chooseAttributeById,
} from '../../testing/attributePicker.ts';
import { testTypeId, testVariableId } from '../../testing/testId.ts';
import {
  type ConditionScope,
  ConditionRulesControl,
} from '../ConditionRulesControl.tsx';
import RuleEditorDialog from '../RuleEditorDialog.tsx';
import { type RuleSetVariant, ruleSetTargets } from '../ruleSet.ts';
import { ruleSections, testCodebook } from './fixtures.ts';
import { RuleEditorHost } from './ruleEditorHost.tsx';

const PERSON = testTypeId('person');
const NOTE = testVariableId('note');
const EGO_NAME = testVariableId('egoName');

const RULE_EDITOR = 'Construct a Rule';

let latest: ConditionDraft = { rules: [] };

function Harness({ scope }: Readonly<{ scope: ConditionScope }>) {
  const [condition, setCondition] = useState<ConditionDraft>({ rules: [] });
  return (
    <ConditionRulesControl
      name="if"
      label="Rules for “If”"
      condition={condition}
      onChange={(next) => {
        latest = next;
        setCondition(next);
      }}
      {...scope}
    />
  );
}

const renderControl = (scope: ConditionScope) => {
  latest = { rules: [] };
  return render(
    <RuleEditorHost sections={ruleSections()}>
      <Harness scope={scope} />
    </RuleEditorHost>,
  );
};

const offeredOperators = async () => {
  const operator = await screen.findByRole('combobox', { name: /Operator/ });
  return within(operator)
    .getAllByRole<HTMLOptionElement>('option')
    .flatMap((option) => (option.value === '' ? [] : [option.value]));
};

/**
 * A logic block or dynamic attribute gives a piped value a version for when
 * it is missing through a rule that asks whether the attribute has an answer:
 * "If: Ego has first_name", otherwise the wording without it.
 */
describe('the rules of a logic block', () => {
  it('can ask whether one of the participant’s attributes has an answer', async () => {
    const user = userEvent.setup();
    renderControl({
      aboutChoices: [],
      codebook: testCodebook,
      subject: undefined,
      allowEgoRules: true,
    });

    await user.click(screen.getByRole('button', { name: 'Add new rule' }));
    const dialog = await screen.findByRole('dialog', { name: RULE_EDITOR });
    await user.click(
      within(dialog).getByRole('radio', {
        name: 'Participant - compare one of the participant’s attributes.',
      }),
    );
    await chooseAttributeById(
      user,
      await waitFor(() => attributeField('Ego attribute')),
      EGO_NAME,
    );

    expect(await offeredOperators()).toEqual(
      expect.arrayContaining(['EXISTS', 'NOT_EXISTS']),
    );

    await user.selectOptions(
      await screen.findByRole('combobox', { name: /Operator/ }),
      'EXISTS',
    );
    await user.click(screen.getByRole('button', { name: 'Finish and Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(latest.rules).toEqual([
      expect.objectContaining({
        type: 'ego',
        options: { attribute: EGO_NAME, operator: 'EXISTS' },
      }),
    ]);
  });

  it('can ask whether an attribute of the node has an answer', async () => {
    const user = userEvent.setup();
    renderControl({
      aboutChoices: ['node'],
      codebook: testCodebook,
      subject: { entity: 'node', type: PERSON },
      allowEgoRules: true,
    });

    await user.click(screen.getByRole('button', { name: 'Add new rule' }));
    const dialog = await screen.findByRole('dialog', { name: RULE_EDITOR });
    await user.click(within(dialog).getByRole('radio', { name: /^Node/ }));
    // The node type is the one the text is shown with, so it is chosen.
    await user.click(
      await within(dialog).findByRole('option', { name: /^Attribute/ }),
    );
    await chooseAttributeById(
      user,
      await waitFor(() => attributeField('Node attribute')),
      NOTE,
    );

    expect(await offeredOperators()).toEqual(
      expect.arrayContaining(['EXISTS', 'NOT_EXISTS']),
    );
  });
});

/**
 * Skip logic and filters read "exists" as conditions do: whether the
 * attribute has been answered, a blank answer being none. So they offer it
 * on an attribute too.
 */
describe('the rules of skip logic and filters', () => {
  it.each<RuleSetVariant>([
    'query',
    'filter',
    'interviewNetworkPanel',
    'externalDataPanel',
  ])('ask whether an attribute has an answer: %s', async (variant) => {
    render(
      <RuleEditorHost sections={ruleSections()}>
        <RuleEditorDialog
          open
          seed={{ type: 'node', options: { type: PERSON, attribute: NOTE } }}
          ruleTypes={[{ label: 'Node', value: 'node' }]}
          allowedTargets={ruleSetTargets(variant)}
          onSave={() => undefined}
          onCancel={() => undefined}
        />
      </RuleEditorHost>,
    );

    expect(await offeredOperators()).toEqual([
      'EXISTS',
      'NOT_EXISTS',
      'EXACTLY',
      'NOT',
      'CONTAINS',
      'DOES_NOT_CONTAIN',
    ]);
  });
});
