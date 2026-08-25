import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    id,
    value,
    onChange,
    options = [],
    entity,
    type,
    disallowCreation,
    disabled,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
  }: {
    'id'?: string;
    'value'?: string;
    'onChange'?: (value: string) => void;
    'options'?: { label: string; value: string }[];
    'entity'?: string;
    'type'?: string;
    'disallowCreation'?: boolean;
    'disabled'?: boolean;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => (
    <select
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
      data-variable-picker=""
      data-entity={entity}
      data-entity-type={type}
      data-disallow-creation={disallowCreation || undefined}
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
    >
      <option value="">Select an attribute</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

// The node/edge type picker reads the protocol from Redux and can open the
// new-type dialog. These cases are about the rule the editor produces, not
// about that picker, so it is replaced by the smallest control that can make
// the same choice.
vi.mock(
  '~/components/sections/fields/EntitySelectField/EntitySelectField',
  () => ({
    // The `id` lands on the wrapper, as it does in the real control: the field's
    // `<label for>` must not become the accessible name of a choice inside it.
    EntitySelectControl: ({
      id,
      value,
      onChange,
      entityType,
    }: {
      id?: string;
      value?: string;
      onChange?: (value: string) => void;
      entityType: 'node' | 'edge';
    }) => (
      <div id={id} data-selected={value ?? ''}>
        <button
          type="button"
          onClick={() =>
            onChange?.(entityType === 'node' ? 'person' : 'friend')
          }
        >
          Select {entityType} type
        </button>
      </div>
    ),
  }),
);

import Rules from '../Rules';
import type { Rule } from '../validateRule';

const CATEGORY_OPTIONS = [
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
];

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        age: { name: 'Age', type: 'number' },
        groups: {
          name: 'Group memberships',
          type: 'categorical',
          options: CATEGORY_OPTIONS,
        },
      },
    },
  },
  edge: {
    friend: {
      name: 'Friend',
      variables: {
        closeness: { name: 'Closeness', type: 'number' },
      },
    },
  },
  ego: {
    variables: {
      consent: { name: 'Consent given', type: 'boolean' },
      groups: {
        name: 'Selected groups',
        type: 'categorical',
        options: CATEGORY_OPTIONS,
      },
      nickname: { name: 'Nickname', type: 'text' },
      alias: { name: 'Alias', type: 'text' },
    },
  },
};

const ADD_RULE = 'Add new skip logic rule';

const renderRules = () => {
  const onChange = vi.fn();

  render(
    <DialogProvider>
      <Rules
        type="query"
        codebook={CODEBOOK}
        addRuleLabel={ADD_RULE}
        onChange={onChange}
      />
    </DialogProvider>,
  );

  return onChange;
};

const openEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: ADD_RULE }));

const finishRule = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Finish and Close' }));

const chooseTarget = async (name: RegExp) =>
  fireEvent.click(await screen.findByRole('radio', { name }));

const chooseRuleKind = async (name: RegExp) =>
  fireEvent.click(await screen.findByRole('option', { name }));

const chooseOption = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: label }), {
    target: { value },
  });

/**
 * The titles of every dialog opened through `useDialog`, which the unit-test
 * setup replaces with a spy — so a confirmation is observed by what it ASKED,
 * not by markup it never renders here.
 */
const discardConfirmations = () =>
  globalThis.__architectDialogMocks.openDialog.mock.calls.map(
    (call) => (call[0] as { title?: unknown }).title,
  );

/** The rules committed by the most recent change, if any. */
const savedRules = (onChange: ReturnType<typeof vi.fn>): Rule[] => {
  const lastCall: unknown = onChange.mock.lastCall?.[0];
  if (
    !lastCall ||
    typeof lastCall !== 'object' ||
    !('rules' in lastCall) ||
    !Array.isArray(lastCall.rules)
  ) {
    throw new Error('The rule list was never given a new set of rules.');
  }
  return lastCall.rules as Rule[];
};

describe('the rule editor refuses an incomplete rule', () => {
  it('names the field it is waiting for, without waiting to be typed in', async () => {
    renderRules();
    openEditor();
    await screen.findByRole('dialog', { name: 'Construct a Rule' });

    finishRule();

    // The point of the migration: a field the researcher has not touched can
    // now say that it is required. Before, its rules only ran on change, so
    // this message was unreachable for exactly the untouched fields
    // `required` exists for.
    expect(await screen.findByText('This field is required.')).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: /Entity/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('keeps the dialog open and commits nothing', async () => {
    const onChange = renderRules();
    openEditor();
    await screen.findByRole('dialog', { name: 'Construct a Rule' });

    finishRule();
    await screen.findByText('This field is required.');

    expect(
      screen.getByRole('dialog', { name: 'Construct a Rule' }),
    ).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('asks for an operand once an operator that takes one is chosen', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);
    chooseOption(/Ego attribute/, 'nickname');
    chooseOption(/^Operator/, 'EXACTLY');

    expect(
      await screen.findByRole('textbox', { name: /Attribute Value/ }),
    ).toBeVisible();

    finishRule();

    expect(await screen.findByText('This field is required.')).toBeVisible();
  });
});

describe('the rule editor commits the rule it shows', () => {
  it('saves an ego attribute rule', async () => {
    const onChange = renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);
    chooseOption(/Ego attribute/, 'consent');
    chooseOption(/^Operator/, 'EXACTLY');

    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }));
    finishRule();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [rule] = savedRules(onChange);
    expect(rule).toMatchObject({
      type: 'ego',
      options: { attribute: 'consent', operator: 'EXACTLY', value: true },
    });
    expect(rule?.id).toEqual(expect.any(String));
  });

  it('saves a presence rule with no attribute at all', async () => {
    const onChange = renderRules();
    openEditor();
    await chooseTarget(/^Node -/);
    fireEvent.click(await screen.findByRole('button', { name: /Select node/ }));

    await chooseRuleKind(/^Presence/);
    fireEvent.click(
      await screen.findByRole('radio', { name: 'does not exist' }),
    );
    finishRule();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [rule] = savedRules(onChange);
    expect(rule).toMatchObject({
      type: 'node',
      options: { type: 'person', operator: 'NOT_EXISTS' },
    });
    // A presence rule is told apart from an attribute rule by the ABSENCE of
    // this key, both here and in the protocol schema.
    expect(rule?.options && 'attribute' in rule.options).toBe(false);
  });

  it('keeps every selection of a categorical operand', async () => {
    const onChange = renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);
    chooseOption(/Ego attribute/, 'groups');
    chooseOption(/^Operator/, 'INCLUDES');

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Family' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Friends' }));
    finishRule();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(savedRules(onChange)[0]).toMatchObject({
      options: { value: ['family', 'friends'] },
    });
  });
});

describe('the option-count operand', () => {
  /**
   * The ego branch used to carry its own copy of the operand controls, which
   * never adopted the whole-number control the alter branch was given, so an
   * ego rule could be saved with a fractional count the protocol rejects.
   */
  it('is a whole number for an ego rule, as it is for an alter rule', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);
    chooseOption(/Ego attribute/, 'groups');
    chooseOption(/^Operator/, 'OPTIONS_GREATER_THAN');

    const count = await screen.findByRole('spinbutton', {
      name: /Selected Option Count/,
    });
    expect(count).toHaveAttribute('step', '1');
    expect(count).toHaveAttribute('min', '0');
  });

  it('accepts zero but not an empty answer', async () => {
    const onChange = renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);
    chooseOption(/Ego attribute/, 'groups');
    chooseOption(/^Operator/, 'OPTIONS_EQUALS');

    const count = await screen.findByRole('spinbutton', {
      name: /Selected Option Count/,
    });
    finishRule();
    expect(await screen.findByText('This field is required.')).toBeVisible();

    fireEvent.change(count, { target: { value: '0' } });
    finishRule();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(savedRules(onChange)[0]).toMatchObject({
      options: { operator: 'OPTIONS_EQUALS', value: 0 },
    });
  });
});

describe('choices that depend on earlier choices', () => {
  it('uses the entity attribute picker with creation disabled', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);

    const egoAttribute = screen.getByRole('combobox', {
      name: /Ego attribute/,
    });
    expect(egoAttribute).toHaveAttribute('data-variable-picker');
    expect(egoAttribute).toHaveAttribute('data-entity', 'ego');
    expect(egoAttribute).toHaveAttribute('data-disallow-creation', 'true');

    await chooseTarget(/^Node -/);
    fireEvent.click(await screen.findByRole('button', { name: /Select node/ }));
    await chooseRuleKind(/^Attribute/);

    const nodeAttribute = screen.getByRole('combobox', { name: 'Attribute' });
    expect(nodeAttribute).toHaveAttribute('data-variable-picker');
    expect(nodeAttribute).toHaveAttribute('data-entity', 'node');
    expect(nodeAttribute).toHaveAttribute('data-entity-type', 'person');
    expect(nodeAttribute).toHaveAttribute('data-disallow-creation', 'true');

    await chooseTarget(/^Edge -/);
    fireEvent.click(await screen.findByRole('button', { name: /Select edge/ }));
    await chooseRuleKind(/^Attribute/);

    const edgeAttribute = screen.getByRole('combobox', { name: 'Attribute' });
    expect(edgeAttribute).toHaveAttribute('data-variable-picker');
    expect(edgeAttribute).toHaveAttribute('data-entity', 'edge');
    expect(edgeAttribute).toHaveAttribute('data-entity-type', 'friend');
    expect(edgeAttribute).toHaveAttribute('data-disallow-creation', 'true');
  });

  it('offers the operators of the attribute that is actually chosen', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);

    chooseOption(/Ego attribute/, 'nickname');
    expect(
      await screen.findByRole('option', { name: 'contains' }),
    ).toBeInTheDocument();

    chooseOption(/Ego attribute/, 'consent');
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'contains' })).toBeNull(),
    );
    expect(screen.getByRole('option', { name: 'is not' })).toBeInTheDocument();
  });

  /**
   * Both attributes here are text, so the operator list is IDENTICAL either
   * side of the change: nothing about the rendered options can make the stale
   * operator disappear on its own, and the operand it revealed is the witness.
   */
  it('starts the comparison again when the attribute changes', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);
    chooseOption(/Ego attribute/, 'nickname');
    chooseOption(/^Operator/, 'EXACTLY');

    fireEvent.change(
      await screen.findByRole('textbox', { name: /Attribute Value/ }),
      { target: { value: 'Dee' } },
    );

    chooseOption(/Ego attribute/, 'alias');

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /^Operator/ })).toHaveValue(
        '',
      ),
    );
    // The operator is gone, so the operand it called for is gone with it —
    // 'Dee' cannot survive into a comparison nobody has chosen yet.
    expect(
      screen.queryByRole('textbox', { name: /Attribute Value/ }),
    ).toBeNull();
  });

  it('starts the comparison again when the attribute changes to another type', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);
    chooseOption(/Ego attribute/, 'consent');
    chooseOption(/^Operator/, 'EXACTLY');

    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }));

    chooseOption(/Ego attribute/, 'groups');

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /^Operator/ })).toHaveValue(
        '',
      ),
    );
    expect(screen.queryByRole('radio', { name: 'Yes' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Family' })).toBeNull();
  });

  /**
   * `groups` exists on BOTH the person type and ego, so a carried-over
   * attribute id would be a perfectly valid choice in the ego list — the
   * select cannot fall back to empty on its own.
   */
  it('does not carry an alter rule attribute over to an ego rule', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Node -/);
    fireEvent.click(await screen.findByRole('button', { name: /Select node/ }));
    await chooseRuleKind(/^Attribute/);
    chooseOption(/^Attribute/, 'groups');
    chooseOption(/^Operator/, 'OPTIONS_EQUALS');

    await chooseTarget(/^Ego -/);

    const attribute = await screen.findByRole('combobox', {
      name: /Ego attribute/,
    });
    await waitFor(() => expect(attribute).toHaveValue(''));
    expect(
      screen.queryByRole('spinbutton', { name: /Selected Option Count/ }),
    ).toBeNull();
  });
});

describe('an existing rule', () => {
  it('opens on the values it was saved with', async () => {
    const onChange = vi.fn();
    render(
      <DialogProvider>
        <Rules
          type="query"
          codebook={CODEBOOK}
          addRuleLabel={ADD_RULE}
          onChange={onChange}
          rules={[
            {
              id: 'rule-1',
              type: 'ego',
              options: {
                attribute: 'nickname',
                operator: 'EXACTLY',
                value: 'Dee',
              },
            },
          ]}
        />
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Edit rule:/ }));

    expect(
      await screen.findByRole('combobox', { name: /Ego attribute/ }),
    ).toHaveValue('nickname');
    expect(screen.getByRole('combobox', { name: /^Operator/ })).toHaveValue(
      'EXACTLY',
    );
    expect(
      screen.getByRole('textbox', { name: /Attribute Value/ }),
    ).toHaveValue('Dee');
  });

  it('keeps its id when it is edited', async () => {
    const onChange = vi.fn();
    render(
      <DialogProvider>
        <Rules
          type="query"
          codebook={CODEBOOK}
          addRuleLabel={ADD_RULE}
          onChange={onChange}
          rules={[
            {
              id: 'rule-1',
              type: 'ego',
              options: {
                attribute: 'nickname',
                operator: 'EXACTLY',
                value: 'Dee',
              },
            },
          ]}
        />
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Edit rule:/ }));
    fireEvent.change(
      await screen.findByRole('textbox', { name: /Attribute Value/ }),
      { target: { value: 'Dennis' } },
    );
    finishRule();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(savedRules(onChange)).toEqual([
      {
        id: 'rule-1',
        type: 'ego',
        options: {
          attribute: 'nickname',
          operator: 'EXACTLY',
          value: 'Dennis',
        },
      },
    ]);
  });
});

describe('closing the editor with unsaved work', () => {
  it('asks before discarding it', async () => {
    renderRules();
    openEditor();
    await chooseTarget(/^Ego -/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The one shared confirmation, reached through DialogForm — the rule
    // editor used to register its own draft and run its own copy of this.
    await waitFor(() =>
      expect(discardConfirmations()).toContain('Unsaved Changes'),
    );
  });

  it('closes straight away when nothing has been entered', async () => {
    renderRules();
    openEditor();
    await screen.findByRole('dialog', { name: 'Construct a Rule' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Construct a Rule' }),
      ).toBeNull(),
    );
    expect(discardConfirmations()).not.toContain('Unsaved Changes');
  });
});
