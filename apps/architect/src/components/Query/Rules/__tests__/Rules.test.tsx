import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import Rules from '../Rules';

const TWO_RULES = [
  {
    id: 'rule-1',
    type: 'node',
    options: { type: 'person', attribute: 'name', operator: 'EXISTS' },
  },
  {
    id: 'rule-2',
    type: 'node',
    options: { type: 'person', attribute: 'age', operator: 'EXISTS' },
  },
];

const renderRules = (allowEdgeRules?: boolean) =>
  render(
    <DialogProvider>
      <Rules
        codebook={{ node: {}, edge: {} }}
        allowEdgeRules={allowEdgeRules}
        addRuleLabel="Add new filter rule"
      />
    </DialogProvider>,
  );

const openRuleEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Add new filter rule' }));

describe('Rules', () => {
  it('offers an edge target by default', async () => {
    renderRules();
    openRuleEditor();

    expect(
      await screen.findByRole('radio', { name: /^Edge -/ }),
    ).toBeInTheDocument();
  });

  it('offers an edge target when edge rules are allowed', async () => {
    renderRules(true);
    openRuleEditor();

    expect(
      await screen.findByRole('radio', { name: /^Edge -/ }),
    ).toBeInTheDocument();
  });

  it('hides the edge target when edge rules are not allowed', async () => {
    renderRules(false);
    openRuleEditor();

    expect(
      await screen.findByRole('radio', { name: /^Node -/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /^Edge -/ }),
    ).not.toBeInTheDocument();
  });

  it('names its one add control from the caller', () => {
    renderRules();

    expect(
      screen.getByRole('button', { name: 'Add new filter rule' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Add new/ })).toHaveLength(1);
  });

  it('shows the chosen matching only in the Rule Matching control', () => {
    render(
      <DialogProvider>
        <Rules
          codebook={{ node: {}, edge: {} }}
          rules={TWO_RULES}
          join="OR"
          addRuleLabel="Add new filter rule"
        />
      </DialogProvider>,
    );

    for (const item of within(screen.getByRole('list')).getAllByRole(
      'listitem',
    )) {
      expect(within(item).queryByText('or')).toBeNull();
    }
    expect(
      screen.getByRole('radio', { name: 'Any rule can match' }),
    ).toBeChecked();
  });

  it('offers ego as a target only for skip logic', async () => {
    render(
      <DialogProvider>
        <Rules
          type="query"
          codebook={{ node: {}, edge: {}, ego: {} }}
          addRuleLabel="Add new skip logic rule"
        />
      </DialogProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Add new skip logic rule' }),
    );

    expect(
      await screen.findByRole('radio', { name: /^Ego -/ }),
    ).toBeInTheDocument();
  });
});
