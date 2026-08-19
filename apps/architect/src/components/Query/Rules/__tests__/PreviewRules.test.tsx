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

const renderRules = (rules = RULES, join?: string) =>
  render(
    <DialogProvider>
      <PreviewRules
        rules={rules}
        codebook={CODEBOOK}
        ruleTypes={[{ label: 'Node', value: 'node' }]}
        addButtonLabel="Add new rule"
        onChange={vi.fn()}
        join={join}
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

  /**
   * Whether a rule set means "all of these" or "any of these" is set by
   * the Rule Matching control below the list, and it used to be read back
   * between the rules as well. The separator was dropped in the move to the
   * shared editable list, leaving three unconnected cards that say nothing
   * about how they combine until the researcher reaches the bottom of the list.
   */
  it.each([
    ['OR', 'or'],
    ['AND', 'and'],
  ])('reads a %s rule set as “%s” between its rules', (join, word) => {
    renderRules(RULES, join);

    const [first, second] = within(screen.getByRole('list')).getAllByRole(
      'listitem',
    );

    // Between the two rules, and only there — a separator after the last one
    // would join it to nothing.
    expect(within(first!).getByText(word)).toBeVisible();
    expect(within(second!).queryByText(word)).toBeNull();
  });

  it.each([
    ['a single rule has nothing to combine with', [RULES[0]!], 'OR'],
    ['nothing has said how the rules combine yet', RULES, undefined],
  ])('renders no separator when %s', (_name, rules, join) => {
    renderRules(rules, join);

    for (const item of within(screen.getByRole('list')).getAllByRole(
      'listitem',
    )) {
      expect(within(item).queryByText('or')).toBeNull();
      expect(within(item).queryByText('and')).toBeNull();
    }
  });

  // The separator was a <fieldset>/<legend>, borrowed for the way a legend
  // cuts a gap in a border. It announced a form group containing no controls
  // to every screen reader, once per join.
  it('does not announce the separator as a form group', () => {
    renderRules(RULES, 'OR');

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
});
