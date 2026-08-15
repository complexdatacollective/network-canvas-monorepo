import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PreviewRule } from '../PreviewRule';

/**
 * `PreviewText` is deliberately NOT mocked: the whole point of the card is
 * that the rule's sentence — entity chip, variable pill, operator, value —
 * renders INSIDE the edit button, so a stand-in would test nothing that
 * matters here.
 */
const ALTER_RULE = {
  type: 'node',
  options: {
    typeLabel: 'person',
    typeColor: 'node-color-seq-1',
    attribute: 'name',
    variableType: 'text',
    operator: 'EXACTLY',
    value: 'Dee',
  },
} as const;

const EDGE_RULE = {
  type: 'edge',
  options: {
    typeLabel: 'friend',
    typeColor: 'edge-color-seq-1',
    attribute: 'closeness',
    variableType: 'ordinal',
    operator: 'EXACTLY',
    value: 3,
  },
} as const;

const EGO_RULE = {
  type: 'ego',
  options: {
    attribute: 'name',
    variableType: 'text',
    operator: 'EXACTLY',
    value: 'Bob',
  },
} as const;

const renderRule = (
  rule: { type: string; options: Record<string, unknown> },
  handlers: { onClick?: () => void; onDelete?: () => void } = {},
) =>
  render(
    <PreviewRule
      type={rule.type}
      options={rule.options}
      onClick={handlers.onClick ?? vi.fn()}
      onDelete={handlers.onDelete ?? vi.fn()}
    />,
  );

const editButton = () => screen.getByRole('button', { name: /^Edit rule:/ });
const deleteButton = () =>
  screen.getByRole('button', { name: /^Delete rule:/ });

describe('PreviewRule', () => {
  it.each([
    ['an alter rule', ALTER_RULE],
    ['an edge rule', EDGE_RULE],
    ['an ego rule', EGO_RULE],
  ])('puts no control and no flow content inside %s card', (_name, rule) => {
    renderRule(rule);

    const edit = editButton();
    // A control inside a control is invalid HTML and gives assistive
    // technology a second, dead target; `<button>` takes phrasing content, so
    // a `<div>`/`<p>`/`<fieldset>` in there is invalid too.
    expect(
      edit.querySelectorAll('button, a, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
    expect(
      edit.querySelectorAll('div, p, fieldset, ul, ol, li, h1, h2, h3, h4'),
    ).toHaveLength(0);
  });

  it('names both controls from the rule they act on', () => {
    renderRule(ALTER_RULE);

    // Every card would otherwise be "Edit rule", and every delete control
    // "Delete rule", with nothing to tell one row from the next.
    //
    // The `\s*` are load-bearing: whether a browser puts a space between two
    // parts of a name depends on their computed `display`, and jsdom loads no
    // stylesheet, so it sees every part of the sentence as inline. What this
    // pins is the sequence — the action word, the entity type, the variable
    // and its type, the operator, the value — which is layout-independent.
    // `e2e/specs/skip-logic-rules.spec.ts` asserts the spacing a real browser
    // produces.
    expect(editButton()).toHaveAccessibleName(
      /^Edit rule:\s*person\s*where\s*text variable\s*name\s*is exactly equal to\s*Dee$/,
    );
    expect(deleteButton()).toHaveAccessibleName(
      /^Delete rule:\s*person\s*where\s*text variable\s*name\s*is exactly equal to\s*Dee$/,
    );
  });

  it('exposes independent semantic edit and delete actions', () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    renderRule(ALTER_RULE, { onClick, onDelete });

    const edit = editButton();
    const remove = deleteButton();

    expect(edit).not.toContainElement(remove);

    fireEvent.click(remove);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(edit);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('leaves exactly one keyboard target on the card, and it is a real button', () => {
    const onClick = vi.fn();
    const { container } = renderRule(ALTER_RULE, { onClick });

    // Enter/Space are deterministic because the browser owns them: the card is
    // a native `<button>`, it takes the only tab stop of its own region, and
    // nothing inside it can take focus or claim the key first.
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect([...focusable].map((element) => element.tagName)).toEqual([
      'BUTTON',
      'BUTTON',
    ]);

    const edit = editButton();
    expect(edit.tagName).toBe('BUTTON');
    expect(edit).toHaveAttribute('type', 'button');
    edit.focus();
    expect(edit).toHaveFocus();
    expect(edit.querySelectorAll('[tabindex]')).toHaveLength(0);

    fireEvent.click(edit);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the delete action visible for keyboard focus', () => {
    renderRule(ALTER_RULE);

    expect(deleteButton()).toHaveClass('group-focus-within:opacity-100');
  });

  it('reads the join as text rather than as a form group', () => {
    render(
      <PreviewRule
        type={ALTER_RULE.type}
        options={ALTER_RULE.options}
        join="OR"
        onClick={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // It used to be a <fieldset>/<legend>, which announced a group with no
    // controls in it between every pair of rules.
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('leaves the entity chip out of the accessibility tree as a control', () => {
    renderRule(ALTER_RULE);

    // "person" is read as part of the card's name, not as a button of its own.
    expect(
      within(editButton()).queryByRole('button', { name: 'person' }),
    ).toBeNull();
    expect(editButton()).toHaveTextContent('person');
  });
});
