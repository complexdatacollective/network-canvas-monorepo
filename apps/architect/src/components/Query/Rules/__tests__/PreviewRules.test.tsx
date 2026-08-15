import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    <PreviewRules
      rules={rules}
      join={join}
      codebook={CODEBOOK}
      onClickRule={vi.fn()}
      onDeleteRule={vi.fn()}
    />,
  );

describe('PreviewRules', () => {
  it('renders the rules as a list, one item each', () => {
    renderRules();

    const list = screen.getByRole('list');
    // `role` is explicit: Tailwind's preflight sets `list-style: none`, which
    // is on its own enough for Safari to drop a list's semantics.
    expect(list.tagName).toBe('UL');
    expect(list).toHaveAttribute('role', 'list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps the join inside the item it follows', () => {
    renderRules();

    const [first, second] = within(screen.getByRole('list')).getAllByRole(
      'listitem',
    );

    // A `<ul>` may contain nothing but `<li>`, so the separator cannot be a
    // sibling of the items — and it belongs to the item it follows.
    expect(first).toHaveTextContent('or');
    expect(second).not.toHaveTextContent('or');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('tells two rules apart by name', () => {
    renderRules();

    // Four identically-named controls would leave a screen-reader user with
    // no way to tell which rule they are about to open or destroy: each name
    // has to carry the rule's own sentence, not just the action.
    for (const name of [
      /^Edit rule:.*Dee$/,
      /^Delete rule:.*Dee$/,
      /^Edit rule:.*Bob$/,
      /^Delete rule:.*Bob$/,
    ]) {
      expect(screen.getAllByRole('button', { name })).toHaveLength(1);
    }
  });

  it('renders no list at all when there are no rules', () => {
    renderRules([], null);

    expect(screen.queryByRole('list')).toBeNull();
    expect(
      screen.getByText('Add rule types from the options below.'),
    ).toBeInTheDocument();
  });
});
