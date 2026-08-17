import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import PreviewRules from '../PreviewRules';

const CODEBOOK = {
  node: {
    person: {
      name: 'person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'name', type: 'text' } },
    },
  },
  edge: {},
  ego: { variables: { nickname: { name: 'nickname', type: 'text' } } },
};

const RULES = [
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
  {
    id: 'rule-2',
    type: 'ego',
    options: { attribute: 'nickname', operator: 'EXACTLY', value: 'Bob' },
  },
];

const renderRules = (rules = RULES, join: string | null = 'OR') =>
  render(
    <DialogProvider>
      <PreviewRules
        rules={rules}
        join={join}
        codebook={CODEBOOK}
        ruleTypes={[{ label: 'Node', value: 'node' }]}
        addButtonLabel="Add new rule"
        onChange={vi.fn()}
      />
    </DialogProvider>,
  );

describe('PreviewRules', () => {
  it('uses the shared editable list, one item per rule', () => {
    renderRules();

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(list).toHaveAttribute('role', 'list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Add new rule' }),
    ).toBeInTheDocument();
  });

  it('keeps the join inside the item it follows', () => {
    renderRules();

    const [first, second] = within(screen.getByRole('list')).getAllByRole(
      'listitem',
    );

    expect(first).toHaveTextContent('or');
    expect(second).not.toHaveTextContent('or');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('tells two rules apart by name', () => {
    renderRules();

    for (const name of [
      /^Edit rule:.*Dee$/,
      /^Delete rule:.*Dee$/,
      /^Edit rule:.*Bob$/,
      /^Delete rule:.*Bob$/,
    ]) {
      expect(screen.getAllByRole('button', { name })).toHaveLength(1);
    }
  });

  it('renders the preview beside separate edit and delete icon buttons', () => {
    renderRules([RULES[0]!], null);

    const item = within(screen.getByRole('list')).getByRole('listitem');
    const edit = within(item).getByRole('button', {
      name: /^Edit rule:.*Dee$/,
    });
    const remove = within(item).getByRole('button', {
      name: /^Delete rule:.*Dee$/,
    });

    expect(edit.querySelector('.lucide-pencil')).toBeInTheDocument();
    expect(remove.querySelector('.lucide-trash-2')).toBeInTheDocument();
    expect(edit).not.toHaveTextContent('Dee');
    expect(remove).not.toHaveClass('opacity-0');
  });

  it('renders the editable-list empty state when there are no rules', () => {
    renderRules([], null);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(
      screen.getByText('No rules have been created yet.'),
    ).toBeInTheDocument();
  });
});
