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

const renderRules = (rules = RULES) =>
  render(
    <DialogProvider>
      <PreviewRules
        rules={rules}
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

  it('does not render join elements between items', () => {
    renderRules();

    const [first, second] = within(screen.getByRole('list')).getAllByRole(
      'listitem',
    );

    expect(first).not.toHaveTextContent(/\b(?:and|or)\b/i);
    expect(second).not.toHaveTextContent(/\b(?:and|or)\b/i);
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
    renderRules([RULES[0]!]);

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
    expect(edit).toHaveAccessibleName(
      'Edit rule: person where text variable name is exactly equal to Dee',
    );
    expect(edit).toHaveClass('h-12', 'bg-(--component-text)');
    expect(edit).not.toHaveClass('elevation-none');
    expect(edit).toHaveClass('text-current');
    expect(remove).toHaveClass('h-12', 'bg-(--component-text)');
    expect(remove).not.toHaveClass('elevation-none');
    expect(remove).not.toHaveClass('opacity-0');
    expect(edit.parentElement).not.toHaveClass('border-t', 'border-l');
    expect(item).toHaveClass(
      'publish-colors',
      'bg-surface-3',
      'elevation-low',
      'rounded-sm',
    );
    expect(item).not.toHaveClass('bg-transparent', 'p-0!', 'shadow-none');
    expect(item.querySelector('[data-rule-surface]')).toBeNull();
  });

  it('renders the editable-list empty state when there are no rules', () => {
    renderRules([]);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(
      screen.getByText('No rules have been created yet.'),
    ).toBeInTheDocument();
  });
});
