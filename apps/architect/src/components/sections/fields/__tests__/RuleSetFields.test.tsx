import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArchitectField from '~/components/Form/ArchitectField';
import { ruleValidator } from '~/components/Query';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import { FilterField, QueryField, type RuleSetValue } from '../RuleSetFields';

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

/**
 * Every add button in the rendered surface, by ACCESSIBLE NAME. `getByRole`'s
 * `name` matcher is handed the computed name, so this reports what assistive
 * technology would announce rather than what `textContent` happens to hold;
 * the matcher always returns false because the query is only a way to
 * enumerate, and `queryAllByRole` tolerates the resulting empty result.
 *
 * The regex is `add-button-names.spec.ts`'s, deliberately — the same
 * convention, asserted here in milliseconds and there across every editor.
 */
const addButtonNames = (): string[] => {
  const names: string[] = [];
  screen.queryAllByRole('button', {
    name: (accessibleName: string) => {
      if (/^(Add|Create) new\b/.test(accessibleName))
        names.push(accessibleName);
      return false;
    },
  });
  return names;
};

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

  it('describes the rule builder as required without marking the group', () => {
    renderRuleSetField(FILTER);

    // `role="group"` does not support `aria-required` — axe reports it as a
    // critical `aria-allowed-attr` failure — so the requirement has to reach a
    // screen reader through the description instead.
    expect(group()).not.toHaveAttribute('aria-required');
    expect(group()).toHaveAccessibleDescription(/Required/);

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
    fireEvent.blur(
      screen.getByRole('button', { name: 'Add new skip logic rule' }),
    );

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

  /**
   * The defect these two adapters existed to reproduce: a stage editor mounts
   * `QueryField` (Skip Logic) and `FilterField` (Filter) at once. Each is one
   * editable list and therefore owns one add control; the names still need to
   * identify which list will receive the rule.
   *
   * Asserted over the accessible names of every add button in the surface, not
   * over the two literals, so a future third mount is covered too.
   */
  it('names every add button distinctly when both rule sets are mounted', () => {
    renderStageForm({
      committedStage: asStage({ id: 'stage-1', type: 'Information' }),
      extraReducers: {
        activeProtocol: () => ({ present: { codebook, stages: [] } }),
      },
      children: (
        <>
          <ArchitectField
            name="skipLogic.filter"
            label="Rules"
            component={QueryField}
            validation={{ validator: ruleValidator }}
          />
          <ArchitectField
            name="filter"
            label="Filter"
            component={FilterField}
            validation={{ validator: ruleValidator }}
          />
        </>
      ),
    });

    const names = addButtonNames();

    expect(names).toEqual(['Add new skip logic rule', 'Add new filter rule']);
    expect(new Set(names).size).toBe(names.length);
  });
});
