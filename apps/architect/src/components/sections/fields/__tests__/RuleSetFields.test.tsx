import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArchitectField from '~/components/Form/ArchitectField';
import { ruleValidator } from '~/components/Query';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import { QueryField, type RuleSetValue } from '../RuleSetFields';

const confirm = vi.fn();
const openDialog = vi.fn();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm, openDialog }),
}));

const codebook = {
  node: {
    person: {
      name: 'person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'name', type: 'text' } },
    },
  },
  edge: {},
  ego: { variables: {} },
};

const FILTER: RuleSetValue = {
  rules: [
    {
      id: 'rule-1',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'name',
        operator: 'EXACTLY',
        value: 'Dee',
      },
    },
  ],
};

/**
 * The composition `SkipLogicFields` uses for `skipLogic.filter`: an
 * `ArchitectField` whose control is the rule builder. Asserting at this level
 * is the point — the identity under test is injected by `Field`, and has to
 * survive the adapter to reach the DOM. A `Rules` rendered on its own would
 * prove nothing about it.
 */
const renderRuleSetField = (initialValue?: RuleSetValue) =>
  renderStageForm({
    committedStage: asStage({ id: 'stage-1', type: 'Information' }),
    extraReducers: {
      activeProtocol: () => ({ present: { codebook, stages: [] } }),
    },
    children: (
      <ArchitectField
        name="skipLogic.filter"
        label="Rules"
        component={QueryField}
        initialValue={initialValue}
        validation={{ required: true, validator: ruleValidator }}
      />
    ),
  });

const container = () =>
  document.querySelector<HTMLElement>('[data-field-name="skipLogic.filter"]')!;
const fieldLabel = () => container().querySelector<HTMLLabelElement>('label')!;
const group = () => screen.getByRole('group', { name: 'Rules' });

describe('the rule-builder field', () => {
  beforeEach(() => {
    confirm.mockReset();
    openDialog.mockReset();
  });

  it('gives the rule builder the field label as its name', () => {
    renderRuleSetField(FILTER);

    // The visible "Rules *" label used to point at nothing at all, leaving
    // the entire rule builder anonymous to assistive technology.
    expect(fieldLabel().htmlFor).not.toBe('');
    expect(document.getElementById(fieldLabel().htmlFor)).toBe(group());
  });

  it('marks the rule builder required and names what describes it', () => {
    renderRuleSetField(FILTER);

    expect(group()).toHaveAttribute('aria-required', 'true');

    const fieldId = fieldLabel().id.replace(/-label$/, '');
    const ids = (group().getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter(Boolean);

    // A dangling IDREF poisons the whole list for a screen reader, so every
    // id named here has to resolve — including the region an error arrives in.
    expect(ids).toContain(`${fieldId}-required`);
    expect(ids).toContain(`${fieldId}-error`);
    for (const id of ids) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it('marks the rule builder invalid, and shows the message once', async () => {
    confirm.mockImplementation(({ onConfirm }: { onConfirm?: () => void }) =>
      onConfirm?.(),
    );

    renderRuleSetField(FILTER);
    expect(group()).toHaveAttribute('aria-invalid', 'false');

    // Emptying the required rule set is what makes it invalid.
    fireEvent.click(screen.getByRole('button', { name: /^Delete rule:/ }));
    fireEvent.blur(screen.getByRole('button', { name: 'Add alter rule' }));

    await waitFor(() => {
      expect(group()).toHaveAttribute('aria-invalid', 'true');
    });

    const errorRegion = document.getElementById(
      `${fieldLabel().id.replace(/-label$/, '')}-error`,
    )!;
    const message = errorRegion.textContent?.trim() ?? '';
    expect(message).not.toBe('');
    // `BaseField` owns the message. The rule builder used to render its own
    // `FieldErrors` too, which nothing ever fed — and which would have said
    // the same thing twice if it had.
    expect(screen.getAllByText(message)).toHaveLength(1);

    // The rule list shows the invalid state the way any other control does.
    expect(group().querySelector('.border-destructive')).not.toBeNull();
  });
});
