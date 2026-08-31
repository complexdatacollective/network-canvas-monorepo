import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

vi.mock('../RuleEditor', () => ({
  default: ({
    open,
    onCancel,
    layoutId,
  }: {
    open: boolean;
    onCancel: () => void;
    layoutId?: string;
  }) => (
    <div
      data-testid="rule-editor"
      data-open={open || undefined}
      data-layout-id={layoutId}
    >
      <button type="button" onClick={onCancel}>
        Close test editor
      </button>
    </div>
  ),
}));

import PreviewRules from '../PreviewRules';
import type { Rule } from '../validateRule';

const CODEBOOK = {
  node: {
    person: {
      name: 'person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'name', type: 'text' },
        relationship_to_ego: {
          name: 'relationship_to_ego',
          type: 'text',
        },
      },
    },
  },
  edge: {},
  ego: { variables: { nickname: { name: 'nickname', type: 'text' } } },
};

const RULES: Rule[] = [
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

const renderRules = (rules: Rule[] = RULES) =>
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
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Add new rule' }),
    ).toBeInTheDocument();
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

  it('names each control from the rule it acts on', () => {
    renderRules([RULES[0]!]);

    const item = within(screen.getByRole('list')).getByRole('listitem');
    const edit = within(item).getByRole('button', {
      name: /^Edit rule:.*Dee$/,
    });
    const remove = within(item).getByRole('button', {
      name: /^Delete rule:.*Dee$/,
    });

    expect(edit).toHaveAccessibleName(
      'Edit rule: person where text attribute name is exactly equal to Dee',
    );
    expect(remove).toHaveAccessibleName(
      'Delete rule: person where text attribute name is exactly equal to Dee',
    );
    // #1399: the sentence names the control without being inside it — the row
    // used to BE the button, so the preview's own chips were controls nested
    // inside a control.
    expect(edit).not.toHaveTextContent('Dee');
    for (const control of [edit, remove]) {
      expect(
        control.querySelectorAll(
          'button, a, input, select, textarea, [tabindex]',
        ),
      ).toHaveLength(0);
    }
  });

  it('renders a resolved no-value attribute as a variable pill', () => {
    renderRules([
      {
        id: 'rule-relationship',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'relationship_to_ego',
          operator: 'NOT_EXISTS',
        },
      },
    ]);

    expect(
      screen.getByLabelText('text attribute relationship_to_ego'),
    ).toBeInTheDocument();
  });

  it('raises each rule off the list surface', () => {
    renderRules([RULES[0]!]);

    // The one presentational choice this adapter makes about the shared list.
    expect(within(screen.getByRole('list')).getByRole('listitem')).toHaveClass(
      'elevation-low',
    );
  });

  it('renders the editable-list empty state when there are no rules', () => {
    renderRules([]);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(
      screen.getByText('No rules have been created yet.'),
    ).toBeInTheDocument();
  });

  it('keeps an existing row identity on its editor through the close morph', async () => {
    renderRules([RULES[0]!]);

    fireEvent.click(screen.getByRole('button', { name: /^Edit rule:.*Dee$/ }));
    const editor = await screen.findByTestId('rule-editor');
    expect(editor).toHaveAttribute('data-layout-id', 'rule-1');

    fireEvent.click(screen.getByRole('button', { name: 'Close test editor' }));
    await waitFor(() => expect(editor).not.toHaveAttribute('data-open'));
    expect(editor).toHaveAttribute('data-layout-id', 'rule-1');
  });

  it('does not invent a shared-layout source for a new rule', async () => {
    renderRules([]);

    fireEvent.click(screen.getByRole('button', { name: 'Add new rule' }));

    expect(await screen.findByTestId('rule-editor')).not.toHaveAttribute(
      'data-layout-id',
    );
  });
});
