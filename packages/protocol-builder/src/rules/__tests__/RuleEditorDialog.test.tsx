import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DialogModule from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  FilterRuleSetField,
  QueryRuleSetField,
} from '../../fields/RuleSetField.tsx';
import { RULE_VALUE_FIELD } from '../../fields/RuleValueField.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  attributeField,
  attributeTrigger,
  chooseAttributeById,
  offeredAttributes,
  unavailableAttributes,
} from '../../testing/attributePicker.ts';
import { testId, testTypeId, testVariableId } from '../../testing/testId.ts';
import type { RuleDraft } from '../rule.ts';
import { EdgeCountRulesProvider } from '../ruleCodebookSource.ts';
import {
  describeRule,
  RULE_PROBLEM_CODES,
  type RuleProblemCode,
} from '../ruleDescription.ts';
import RuleEditorDialog, {
  ruleDraftRefusal,
  type RuleTypeOption,
} from '../RuleEditorDialog.tsx';
import {
  type RuleSetValue,
  ruleSetTargets,
  type RuleSetVariant,
} from '../ruleSet.ts';
import { nodeRule, ruleSections, testCodebook } from './fixtures.ts';
import { RuleEditorHost } from './ruleEditorHost.tsx';

const PERSON = testTypeId('person');
const FRIEND = testTypeId('friend');
const GHOST = testTypeId('ghost');
const AGE = testVariableId('age');
const BORN = testVariableId('born');
const CLOSENESS = testVariableId('closeness');
const EGO_NAME = testVariableId('egoName');
const FAVOURITE_COLOUR = testVariableId('favouriteColour');
const HOME = testVariableId('home');
const MOOD = testVariableId('mood');
const NOTE = testVariableId('note');
const SECRET = testVariableId('secret');
const STRENGTH = testVariableId('strength');
const HEIGHT = testVariableId('height');
const FLAG = testVariableId('flag');

/**
 * `layoutId` is a Motion prop, so it leaves no trace in the DOM: what the rule
 * editor's caller needs to know is that the dialog RECEIVED the identity of
 * the row it morphs out of, which is what this records. Fresco's own `Dialog`
 * is still the thing that renders — the mock is a passthrough, so every test
 * in this file exercises the real component.
 */
const dialogRenders = vi.hoisted(() =>
  vi.fn<(props: { layoutId?: string }) => void>(),
);

vi.mock('@codaco/fresco-ui/dialogs/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof DialogModule>();
  const RealDialog = actual.default;
  return {
    ...actual,
    default: (props: DialogModule.DialogProps) => {
      dialogRenders(props);
      return createElement(RealDialog, props);
    },
  };
});

beforeEach(() => {
  dialogRenders.mockClear();
});

const RULE_SET_FIELD = 'skipLogic.filter';
const ADD_RULE = 'Add new skip logic rule';
const RULE_EDITOR = 'Construct a Rule';

const RULE_TYPES: readonly RuleTypeOption[] = [
  {
    label: 'Node - match a node type or one of its attributes.',
    value: 'node',
  },
  { label: 'Ego - match one of the ego attributes.', value: 'ego' },
];

/**
 * The targets a skip-logic query may hold — the rule set this dialog is
 * mounted from throughout this file, and every target the schema allows.
 */
const QUERY_TARGETS = ruleSetTargets('query');

/** A network filter, which the schema does not let hold an ego rule. */
const FILTER_TARGETS = ruleSetTargets('filter');

/** Reports the rule set the form holds, so a test can assert what was saved. */
function RuleSetProbe() {
  const value = useFormValue([RULE_SET_FIELD])[RULE_SET_FIELD];
  return (
    <output data-testid="rule-set-value">
      {JSON.stringify(value ?? null)}
    </output>
  );
}

const probedRuleSet = (): RuleSetValue | null => {
  const text = screen.getByTestId('rule-set-value').textContent ?? 'null';
  return JSON.parse(text) as RuleSetValue | null;
};

/**
 * The whole composition a researcher meets: a rule set field whose rows open
 * the editor. Everything the editor does about saving, cancelling and morphing
 * is a conversation with the list, so it is tested through the list.
 */
function renderRuleList(rules?: readonly RuleDraft[]) {
  render(
    <RuleEditorHost
      sections={ruleSections(rules)}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      <BuilderSection sectionKey="skip-logic" title="Skip logic">
        <Field
          name={RULE_SET_FIELD}
          label="Rules"
          component={QueryRuleSetField}
        />
        <RuleSetProbe />
      </BuilderSection>
    </RuleEditorHost>,
  );
}

/**
 * The editor with its two answers to the caller spied on.
 *
 * `onSave` and `onCancel` are a conversation with the list the editor was
 * opened from, and a list cannot show what it was never told: the two are
 * observed directly here so that saving and dismissing can be told apart.
 */
function SpiedEditor({
  seed,
  onSave,
  onCancel,
}: {
  seed: RuleDraft;
  onSave: (rule: RuleDraft) => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <RuleEditorHost sections={ruleSections()}>
      <RuleEditorDialog
        open={open}
        seed={seed}
        ruleTypes={RULE_TYPES}
        allowedTargets={QUERY_TARGETS}
        onSave={(rule) => {
          onSave(rule);
          setOpen(false);
        }}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      />
    </RuleEditorHost>
  );
}

const renderSpiedEditor = (seed: RuleDraft = { type: '' }) => {
  const onSave = vi.fn<(rule: RuleDraft) => void>();
  const onCancel = vi.fn<() => void>();
  render(<SpiedEditor seed={seed} onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
};

/** A node attribute rule as far as its operator, in the fewest clicks. */
const buildNodeAttributeRuleUpTo = async (
  user: ReturnType<typeof userEvent.setup>,
  attribute: string,
  operator: string,
) => {
  await user.click(
    screen.getByRole('radio', {
      name: 'Node - match a node type or one of its attributes.',
    }),
  );
  await user.click(await screen.findByRole('radio', { name: 'Person' }));
  await user.click(await screen.findByRole('option', { name: /Attribute/ }));
  // Chosen through the picker's own window, by the id the rule stores: what
  // every test below reads back is the saved rule, not the words on screen.
  await chooseAttributeById(
    user,
    await waitFor(() => attributeField('Node attribute')),
    attribute,
  );
  await user.selectOptions(
    await screen.findByRole('combobox', { name: /Operator/ }),
    operator,
  );
};

const savedRule = (onSave: ReturnType<typeof vi.fn>): RuleDraft =>
  onSave.mock.calls[0]?.[0] as RuleDraft;

const savedOptions = (
  onSave: ReturnType<typeof vi.fn>,
): Record<string, unknown> => savedRule(onSave).options ?? {};

const openNewRule = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: ADD_RULE }));
  return await screen.findByRole('dialog', { name: RULE_EDITOR });
};

const openExistingRule = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Edit rule:/ }));
  return await screen.findByRole('dialog', { name: RULE_EDITOR });
};

/** An ego rule as far as its operator, leaving the operand to the caller. */
const buildEgoRuleUpTo = async (
  user: ReturnType<typeof userEvent.setup>,
  operator: string,
) => {
  await user.click(
    screen.getByRole('radio', {
      name: 'Ego - match one of the ego attributes.',
    }),
  );
  await chooseAttributeById(
    user,
    await waitFor(() => attributeField('Ego attribute')),
    EGO_NAME,
  );
  await user.selectOptions(
    await screen.findByRole('combobox', { name: /Operator/ }),
    operator,
  );
};

const finishAndClose = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Finish and Close' }));

describe('the shared-element morph out of a rule row', () => {
  it('pairs an edited row with the dialog that replaces it', async () => {
    const user = userEvent.setup();
    renderRuleList([nodeRule(testId('rule-a'))]);

    await openExistingRule(user);

    // A rule's own id IS its row's identity, so the dialog morphs out of the
    // rule it edits rather than out of whatever was at that index.
    await waitFor(() =>
      expect(dialogRenders).toHaveBeenCalledWith(
        expect.objectContaining({ layoutId: testId('rule-a') }),
      ),
    );
  });

  it('opens the rule that was clicked, not the one at that position', async () => {
    const user = userEvent.setup();
    // Two rules that say exactly the same thing: their ids are the only thing
    // that tells the rows apart, so a list identifying rows by anything else
    // cannot say which of them this dialog belongs to.
    renderRuleList([nodeRule(testId('rule-a')), nodeRule(testId('rule-b'))]);

    const [, secondEdit] = screen.getAllByRole('button', {
      name: /^Edit rule:/,
    });
    expect(secondEdit).toBeDefined();
    await user.click(secondEdit!);
    await screen.findByRole('dialog', { name: RULE_EDITOR });

    await waitFor(() =>
      expect(dialogRenders).toHaveBeenCalledWith(
        expect.objectContaining({ layoutId: testId('rule-b') }),
      ),
    );
  });

  it('gives a rule with no row of its own nothing to travel from', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);

    expect(dialogRenders).toHaveBeenCalled();
    // A rule being added has no row yet, so there is nothing for the dialog to
    // be the same thing as — and borrowing another row's identity would morph
    // it out of a rule it has nothing to do with.
    expect(
      dialogRenders.mock.calls.every(([props]) => props.layoutId === undefined),
    ).toBe(true);
  });
});

describe('dismissing the rule editor', () => {
  it('asks before discarding a rule the researcher has started', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByText(
        'This editor holds changes that have not been saved. Closing it now discards them.',
      ),
    ).toBeInTheDocument();
    // Still open behind the question, with the choice the researcher made.
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(probedRuleSet()).toBeNull();
  });

  it('keeps the rule on screen when the researcher decides not to discard it', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Keep editing' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    ).toBeChecked();
  });

  it('closes a rule opened for editing and left alone, without asking', async () => {
    const user = userEvent.setup();
    renderRuleList([nodeRule(testId('rule-a'))]);

    await openExistingRule(user);
    // The rule the editor opened on is on screen, so the values the fields
    // registered with are the seeded ones rather than empty: what follows is a
    // dismissal of an untouched draft, not of one that never loaded.
    expect(await screen.findByRole('radio', { name: 'Person' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(
      screen.queryByRole('button', { name: 'Discard changes' }),
    ).not.toBeInTheDocument();
    // The rule it was opened on is still there, unchanged.
    expect(probedRuleSet()?.rules).toHaveLength(1);
  });
});

describe('a rule the editor refuses to save', () => {
  it('attaches an unanswered part of the rule to the control that holds it', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await buildEgoRuleUpTo(user, 'EXACTLY');
    // Everything but the operand, which the chosen operator compares against.
    await finishAndClose(user);

    const operand = await screen.findByRole('textbox', {
      name: 'Attribute value',
    });
    await waitFor(() =>
      expect(operand).toHaveAccessibleDescription(/This field is required/),
    );
    expect(operand).toHaveFocus();
    expect(operand).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    expect(probedRuleSet()).toBeNull();
  });

  it('attaches an operand that is not a regular expression to the operand control', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await buildEgoRuleUpTo(user, 'CONTAINS');
    // `[[` is user-event's escape for a literal opening bracket, which is what
    // makes this an unterminated character class rather than a key descriptor.
    await user.type(
      await screen.findByRole('textbox', { name: 'Attribute value' }),
      '[[unclosed',
    );
    await finishAndClose(user);

    const operand = screen.getByRole('textbox', { name: 'Attribute value' });
    await waitFor(() =>
      expect(operand).toHaveAccessibleDescription(
        /This is not a valid regular expression/,
      ),
    );
    expect(operand).toHaveFocus();
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    expect(probedRuleSet()).toBeNull();

    // The refusal is a correction, not a dead end: fixing the expression and
    // asking again saves the rule.
    await user.type(operand, ']');
    await finishAndClose(user);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(probedRuleSet()?.rules?.[0]).toMatchObject({
      type: 'ego',
      options: {
        attribute: EGO_NAME,
        operator: 'CONTAINS',
        value: '[unclosed]',
      },
    });
  });

  /**
   * An operand picked from an attribute's own options has to BE one of them,
   * and the editor is the only place that can say so: the protocol schema
   * checks the SHAPE of a rule's value and deliberately stops there, because a
   * protocol already in the field holds rules naming options that have since
   * been renamed or deleted, and refusing to load one would lock the
   * researcher out of the editor that could fix it (ruling on issue #1548).
   *
   * The option controls offer nothing but the attribute's current options, so
   * this is reached by OPENING a rule that already names one it no longer has:
   * the value is seeded into a control that shows nothing selected, and
   * committing it unchanged would write the unmatchable rule straight back.
   */
  const staleOptionRule = (value: unknown): RuleDraft => ({
    id: testId('rule-a'),
    type: 'node',
    options: {
      type: PERSON,
      attribute: MOOD,
      operator: 'INCLUDES',
      value,
    },
  });

  it('refuses an operand naming an option the attribute no longer offers', async () => {
    const user = userEvent.setup();
    renderRuleList([staleOptionRule(['retired'])]);

    await openExistingRule(user);
    await finishAndClose(user);

    expect(
      await screen.findByText(
        'This rule compares against "retired", which this attribute no longer offers. Choose from the options it does.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    // The unmatchable rule is still exactly as it was found, rather than
    // committed back by the save that was refused.
    expect(probedRuleSet()?.rules).toEqual([staleOptionRule(['retired'])]);
  });

  it('refuses a list for one member the attribute no longer offers', async () => {
    const user = userEvent.setup();
    renderRuleList([staleOptionRule(['happy', 'retired'])]);

    await openExistingRule(user);
    await finishAndClose(user);

    // Only the member that went missing is named: `happy` is still an option.
    expect(
      await screen.findByText(
        'This rule compares against "retired", which this attribute no longer offers. Choose from the options it does.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
  });

  it('refuses an operand whose type is not the type the option was authored with', async () => {
    const user = userEvent.setup();
    // `strength`'s options are the numbers 1 and 2, and the interview compares
    // an operand against the stored answer by identity: the string "1" is not
    // the option whose value is 1.
    renderRuleList([
      {
        id: testId('rule-a'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: STRENGTH,
          operator: 'EXACTLY',
          value: '1',
        },
      },
    ]);

    await openExistingRule(user);
    await finishAndClose(user);

    expect(
      await screen.findByText(
        'This rule compares against "1", which this attribute no longer offers. Choose from the options it does.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
  });

  it('saves the same operand as the number the option was authored with', async () => {
    const user = userEvent.setup();
    renderRuleList([
      {
        id: testId('rule-a'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: STRENGTH,
          operator: 'EXACTLY',
          value: 1,
        },
      },
    ]);

    await openExistingRule(user);
    await finishAndClose(user);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(probedRuleSet()?.rules?.[0]).toMatchObject({
      options: { attribute: STRENGTH, operator: 'EXACTLY', value: 1 },
    });
  });
});

/**
 * The operand control, chosen by the attribute's type. What it commits is what
 * the interview runtime compares, so a shape that only LOOKS right — a number
 * kept as text, a count with a fraction in it — is a rule the protocol schema
 * refuses at the far end of the editor.
 */
describe('the operand a rule compares against', () => {
  it('states the missing operand in the researcher’s own words', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, AGE, 'GREATER_THAN');
    await finishAndClose(user);

    const operand = await screen.findByRole('spinbutton', {
      name: /Attribute value/,
    });
    // Fresco's own wording addresses a participant mid-interview ("You must
    // answer this question before continuing"), which is not who is reading
    // this.
    await waitFor(() =>
      expect(operand).toHaveAccessibleDescription(/This field is required\./),
    );
    expect(operand).not.toHaveAccessibleDescription(/before continuing/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('commits a numeric operand as a number', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, AGE, 'GREATER_THAN');
    await user.type(
      await screen.findByRole('spinbutton', { name: /Attribute value/ }),
      '30',
    );
    await finishAndClose(user);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // The interview compares this against a number, and the schema refuses a
    // numeric comparison whose operand is text.
    expect(savedOptions(onSave).value).toBe(30);
  });

  it('commits a scalar operand as a number', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, CLOSENESS, 'GREATER_THAN');
    // A scalar is offered the numeric operators, so its operand has to be
    // entered — and committed — as a number: the runtime's relational
    // comparison and its deep equality both read a scalar answer as one.
    await user.type(
      await screen.findByRole('spinbutton', { name: /Attribute value/ }),
      '0.5',
    );
    await finishAndClose(user);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedOptions(onSave).value).toBe(0.5);
  });

  it('refuses a negative count of options', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, MOOD, 'OPTIONS_GREATER_THAN');
    const count = await screen.findByRole('spinbutton', {
      name: /Selected option count/,
    });
    fireEvent.change(count, { target: { value: '-1' } });
    await finishAndClose(user);

    // There is no such thing as minus one selected option. Left unchecked,
    // `OPTIONS_GREATER_THAN -1` matches an attribute nobody answered and
    // `OPTIONS_LESS_THAN -1` matches nothing at all.
    //
    // Queried afresh: a saved rule takes the dialog with it, and asserting
    // against the detached control would report the failure as a type error
    // rather than as the missing refusal it is.
    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: /Selected option count/ }),
      ).toHaveAccessibleDescription(/greater than or equal to 0\./),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a negative number of edges', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(rule: RuleDraft) => void>();
    render(
      <EdgeCountRulesProvider value>
        <SpiedEditor
          seed={{
            type: 'edge',
            options: { type: FRIEND, count: 'GREATER_THAN', value: 2 },
          }}
          onSave={onSave}
          onCancel={() => undefined}
        />
      </EdgeCountRulesProvider>,
    );

    // The control's own `min` refuses nothing with native validation off, and
    // the protocol schema has no negative count of edges.
    const edges = await screen.findByRole('spinbutton', {
      name: /Number of edges/,
    });
    fireEvent.change(edges, { target: { value: '-1' } });
    await finishAndClose(user);

    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: /Number of edges/ }),
      ).toHaveAccessibleDescription(/greater than or equal to 0\./),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a count of options that is not a whole number', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, MOOD, 'OPTIONS_GREATER_THAN');
    const count = await screen.findByRole('spinbutton', {
      name: /Selected option count/,
    });
    // Set in one go: typing it would be read a keystroke at a time, and the
    // control commits each intermediate reading.
    fireEvent.change(count, { target: { value: '1.5' } });
    await finishAndClose(user);

    // There is no such thing as one and a half selected options, so nothing is
    // committed and the control says it has no answer.
    await waitFor(() =>
      expect(count).toHaveAccessibleDescription(/This field is required\./),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('starts a multi-select operand as a selection, not as text', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, MOOD, 'OPTIONS_GREATER_THAN');
    fireEvent.change(
      await screen.findByRole('spinbutton', { name: /Selected option count/ }),
      { target: { value: '2' } },
    );

    // Changing the operator resets the operand to the empty value for the
    // attribute's type — for a categorical attribute, an empty SELECTION.
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Operator/ }),
      'INCLUDES',
    );
    await user.click(await screen.findByRole('checkbox', { name: 'Happy' }));
    await finishAndClose(user);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedOptions(onSave).value).toEqual(['happy']);
  });

  it('asks for a yes/no operand rather than starting on one of the answers', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, FLAG, 'EXACTLY');

    // Choosing an operator is not choosing an operand. A control that opened
    // on "No" would both put an answer nobody gave into the rule and satisfy
    // the field's own `required`, so the researcher would never be asked.
    expect(await screen.findByRole('radio', { name: 'Yes' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'No' })).not.toBeChecked();

    await finishAndClose(user);

    await waitFor(() =>
      expect(
        screen.getByRole('radiogroup', { name: /Attribute value/ }),
      ).toHaveAccessibleDescription(/This field is required\./),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('commits a yes/no operand of "No" as an answer', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, FLAG, 'EXACTLY');
    await user.click(await screen.findByRole('radio', { name: 'No' }));
    await finishAndClose(user);

    // `false` is an answer, not an absence: the rule the researcher meant to
    // build has to still be buildable once the empty operand stops being one.
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedOptions(onSave).value).toBe(false);
  });

  it('bounds a date operand by the attribute’s own earliest and latest date', async () => {
    const user = userEvent.setup();
    renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, BORN, 'EXACTLY');

    // The operand is compared against the stored answer, so the dates it can
    // take are the dates the attribute's own picker can record — bounds
    // included. Without them the control offers every year back to 1920 and
    // commits one the interview can never see.
    const years = await screen.findByRole('combobox', {
      name: /Attribute value/,
    });
    expect(
      [...years.querySelectorAll('option')]
        .map((option) => option.value)
        .filter((value) => value !== ''),
    ).toEqual([
      '1810',
      '1809',
      '1808',
      '1807',
      '1806',
      '1805',
      '1804',
      '1803',
      '1802',
      '1801',
      '1800',
    ]);
  });
});

/**
 * Every list in this dialog is narrower than what a stored rule may hold: the
 * operators the editor offers are fewer than the schema accepts, the entity
 * types come from today's codebook, and the targets come from the host's own
 * rule set. A control given a value that matches none of its options shows
 * nothing chosen — a native select falls back to its placeholder, a radio group
 * checks nothing — and none of that clears the value, so what the researcher
 * cannot see is saved back exactly as it was.
 */
describe('a choice a stored rule holds that the editor does not offer', () => {
  const attributeRule = (operator: string): RuleDraft => ({
    id: testId('rule-a'),
    type: 'node',
    options: { type: PERSON, attribute: AGE, operator },
  });

  it('shows a stored presence operator instead of an empty select', async () => {
    const user = userEvent.setup();
    renderRuleList([attributeRule('EXISTS')]);

    await openExistingRule(user);

    const operator = await screen.findByRole('combobox', { name: /Operator/ });
    expect(operator).toHaveValue('EXISTS');
    // Named as what it is: the schema accepts it, so the researcher is being
    // shown their rule rather than sent to fix something that is not wrong.
    expect(
      within(operator).getByRole('option', {
        name: 'exists (no longer offered)',
      }),
    ).toBeEnabled();
  });

  it('saves a rule holding one back unchanged', async () => {
    const user = userEvent.setup();
    renderRuleList([attributeRule('EXISTS')]);

    await openExistingRule(user);
    await screen.findByRole('combobox', { name: /Operator/ });
    await finishAndClose(user);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(probedRuleSet()?.rules?.[0]).toMatchObject({
      options: { attribute: AGE, operator: 'EXISTS' },
    });
  });

  it('shows a rule target this rule set does not offer', async () => {
    // `RULE_TYPES` offers node and ego rules only, which is a host's choice
    // about its own rule set. The protocol schema accepts a node, edge or ego
    // rule in every one of them, so a stored rule can hold a target the set
    // would not build — and the target group then showed nothing chosen at all
    // over a rule that is pointed somewhere.
    renderSpiedEditor({
      id: testId('rule-a'),
      type: 'edge',
      options: { type: FRIEND, operator: 'EXISTS' },
    });

    const target = await screen.findByRole('radio', {
      name: 'Edge (not offered in this rule set)',
    });
    expect(target).toBeChecked();
    expect(target).toBeDisabled();
  });

  it('shows an entity type the codebook has lost, rather than nothing chosen', async () => {
    const user = userEvent.setup();
    renderRuleList([
      {
        id: testId('rule-a'),
        type: 'node',
        // A collaborator deleted the node type this rule is pointed at.
        options: { type: GHOST, operator: 'EXISTS' },
      },
    ]);

    await openExistingRule(user);

    // Same mechanism as the operator select and the attribute picker: a
    // control that offers only what the codebook still has shows nothing
    // chosen over a rule that is still pointed somewhere, and saves it back.
    const missing = await screen.findByRole('radio', {
      name: `${GHOST} — this type is no longer in the codebook`,
    });
    expect(missing).toBeChecked();
    expect(missing).toBeDisabled();
    expect(
      screen.getByText(
        'This type is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
  });

  it('opens a stored layout rule by the layout’s name', async () => {
    const user = userEvent.setup();
    renderRuleList([
      {
        id: testId('rule-a'),
        type: 'node',
        // `home` is a layout of the codebook: still there, and answered with
        // a point no rule can compare against. The picker is given the
        // attributes a rule CAN be built on, so leaving this one out of that
        // list made it indistinguishable from one that had been deleted — and
        // the researcher was sent to the codebook to look for something that
        // is still sitting there.
        options: {
          type: PERSON,
          attribute: HOME,
          operator: 'EXACTLY',
          value: 'somewhere',
        },
      },
    ]);

    await openExistingRule(user);

    const attribute = await waitFor(() => attributeField('Node attribute'));
    // The rule's own choice is still held and shown as itself...
    expect(attributeTrigger(attribute)).toHaveAccessibleName(
      /^Node attribute Home/u,
    );
    // ...with what is wrong with it said under the control.
    expect(
      screen.getByText(
        'This attribute cannot be used in a rule. Choose another one.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no longer in the codebook/)).toBeNull();
  });

  it('opens and saves a stored rule naming a layout its node type does not have', async () => {
    // No stage of this protocol places people in `home`, so the layout is
    // not among the person type's attributes. A rule naming it is still a
    // valid schema 8 rule carried forward, and it opens showing the layout's
    // name and saves back as it was.
    const user = userEvent.setup();
    renderRuleList([
      {
        id: testId('rule-a'),
        type: 'node',
        options: { type: PERSON, attribute: HOME, operator: 'EXISTS' },
      },
    ]);

    await openExistingRule(user);

    const attribute = await waitFor(() => attributeField('Node attribute'));
    expect(attributeTrigger(attribute)).toHaveAccessibleName(
      /^Node attribute Home/u,
    );
    const operator = await screen.findByRole('combobox', { name: /Operator/ });
    expect(operator).toHaveValue('EXISTS');
    expect(screen.queryByText(/no longer in the codebook/)).toBeNull();

    await finishAndClose(user);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(probedRuleSet()?.rules?.[0]).toMatchObject({
      type: 'node',
      options: { type: PERSON, attribute: HOME, operator: 'EXISTS' },
    });
  });

  it('shows an operator the attribute’s type does not allow, and refuses to offer it again', async () => {
    const user = userEvent.setup();
    renderRuleList([
      {
        id: testId('rule-a'),
        type: 'node',
        // A collaborator retyped the attribute under this rule: `note` is
        // text, and the schema does not allow a relational comparison there.
        options: {
          type: PERSON,
          attribute: NOTE,
          operator: 'GREATER_THAN',
          value: 30,
        },
      },
    ]);

    await openExistingRule(user);

    const operator = await screen.findByRole('combobox', { name: /Operator/ });
    expect(operator).toHaveValue('GREATER_THAN');
    // Disabled, unlike the presence operator above: this one IS wrong, so the
    // editor shows what the rule says without letting it be chosen again.
    expect(
      within(operator).getByRole('option', {
        name: 'is greater than (not valid for this attribute)',
      }),
    ).toBeDisabled();
  });
});

/**
 * A rule set of each kind, as a stage editor mounts it: the three filters
 * share one field asked which it is, and skip logic has its own.
 */
function renderRuleSetOf(
  variant: RuleSetVariant,
  rules?: readonly RuleDraft[],
) {
  render(
    <RuleEditorHost sections={ruleSections(rules)}>
      <BuilderSection sectionKey="form-fields" title="Rules">
        {variant === 'query' ? (
          <Field
            name={RULE_SET_FIELD}
            label="Rules"
            component={QueryRuleSetField}
          />
        ) : (
          <Field
            name={RULE_SET_FIELD}
            label="Rules"
            component={FilterRuleSetField}
            variant={variant}
          />
        )}
      </BuilderSection>
    </RuleEditorHost>,
  );
}

const ENCRYPTED_ROW_PROBLEM =
  'This rule compares the answers to an encrypted attribute. Rules are checked without the participant’s passphrase, so they can only check whether an encrypted attribute is answered. Edit or delete the rule.';

const ENCRYPTED_OPERATOR_HINT =
  'This attribute is encrypted. Rules are checked without the participant’s passphrase, so a rule can only check whether it is answered.';

/**
 * An encrypted answer is stored as ciphertext only the participant's
 * passphrase opens, and rules are checked without it. The protocol schema
 * refuses a rule comparing one wherever the rule reads interview answers, and
 * accepts one in a panel over an imported file, whose rows nothing encrypts.
 * Whether it was answered survives encryption, so every rule set may ask that —
 * and the editor offers the attribute everywhere, with only the operators the
 * schema accepts for it there.
 */
describe('an encrypted attribute', () => {
  const ADD_LABELS: Readonly<Record<RuleSetVariant, string>> = {
    query: ADD_RULE,
    filter: 'Add new filter rule',
    interviewNetworkPanel: 'Add new filter rule',
    externalDataPanel: 'Add new filter rule',
  };

  const startNodeRule = async (
    user: ReturnType<typeof userEvent.setup>,
    variant: RuleSetVariant,
  ) => {
    await user.click(screen.getByRole('button', { name: ADD_LABELS[variant] }));
    await screen.findByRole('dialog', { name: RULE_EDITOR });
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(await screen.findByRole('radio', { name: 'Person' }));
    await user.click(await screen.findByRole('option', { name: /Attribute/ }));
    return waitFor(() => attributeField('Node attribute'));
  };

  const offeredOperators = async () => {
    const operator = await screen.findByRole('combobox', { name: /Operator/ });
    return within(operator)
      .getAllByRole<HTMLOptionElement>('option')
      .flatMap((option) => (option.value === '' ? [] : [option.value]));
  };

  it.each<RuleSetVariant>([
    'query',
    'filter',
    'interviewNetworkPanel',
    'externalDataPanel',
  ])('is offered: %s', async (variant) => {
    const user = userEvent.setup();
    renderRuleSetOf(variant);
    expect(
      await offeredAttributes(user, await startNodeRule(user, variant)),
    ).toContain(SECRET);
  });

  it.each<RuleSetVariant>(['query', 'filter', 'interviewNetworkPanel'])(
    'can only be asked whether it is answered where a rule reads interview answers: %s',
    async (variant) => {
      const user = userEvent.setup();
      renderRuleSetOf(variant);
      await chooseAttributeById(
        user,
        await startNodeRule(user, variant),
        SECRET,
      );

      expect(await offeredOperators()).toEqual(['EXISTS', 'NOT_EXISTS']);
      expect(screen.getByText(ENCRYPTED_OPERATOR_HINT)).toBeInTheDocument();
    },
  );

  it('is compared like any text attribute in a panel over an imported file', async () => {
    const user = userEvent.setup();
    renderRuleSetOf('externalDataPanel');
    await chooseAttributeById(
      user,
      await startNodeRule(user, 'externalDataPanel'),
      SECRET,
    );

    expect(await offeredOperators()).toEqual([
      'EXACTLY',
      'NOT',
      'CONTAINS',
      'DOES_NOT_CONTAIN',
    ]);
    expect(screen.queryByText(ENCRYPTED_OPERATOR_HINT)).toBeNull();
  });

  it('saves a rule asking whether it is answered', async () => {
    const user = userEvent.setup();
    renderRuleSetOf('query');
    await chooseAttributeById(user, await startNodeRule(user, 'query'), SECRET);
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /Operator/ }),
      'EXISTS',
    );
    await finishAndClose(user);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: /^Edit rule:/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(ENCRYPTED_ROW_PROBLEM)).toBeNull();
  });

  const storedRule: RuleDraft = {
    id: testId('rule-a'),
    type: 'node',
    options: {
      type: PERSON,
      attribute: SECRET,
      operator: 'EXACTLY',
      value: 'Ada',
    },
  };

  it('marks a stored comparison, and lets it become a question of whether it is answered', async () => {
    const user = userEvent.setup();
    renderRuleSetOf('query', [storedRule]);

    expect(screen.getByText(ENCRYPTED_ROW_PROBLEM)).toBeInTheDocument();

    await openExistingRule(user);
    const attribute = await waitFor(() => attributeField('Node attribute'));
    // The attribute is a fine one to ask about; it is the comparison that has
    // to go, so the attribute is shown as itself.
    expect(within(attribute).getByText('Secret')).toBeInTheDocument();
    // Still in the codebook, so it is not reported as one that went.
    expect(screen.queryByText(/no longer in the codebook/)).toBeNull();
    const operator = await screen.findByRole('combobox', { name: /Operator/ });
    expect(operator).toHaveValue('EXACTLY');
    expect(
      within(operator).getByRole('option', {
        name: 'is exactly (not valid for this attribute)',
      }),
    ).toBeDisabled();
    expect(screen.getByText(ENCRYPTED_OPERATOR_HINT)).toBeInTheDocument();

    await finishAndClose(user);
    expect(
      await screen.findByText(
        'A rule can only check whether an encrypted attribute is answered. Choose another operator or another attribute.',
      ),
    ).toBeInTheDocument();

    await user.selectOptions(operator, 'NOT_EXISTS');
    await finishAndClose(user);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    expect(screen.queryByText(ENCRYPTED_ROW_PROBLEM)).toBeNull();
  });

  it('is accepted on a rule in a panel over an imported file', async () => {
    const user = userEvent.setup();
    renderRuleSetOf('externalDataPanel', [storedRule]);

    expect(screen.queryByText(ENCRYPTED_ROW_PROBLEM)).toBeNull();

    await openExistingRule(user);
    const attribute = await waitFor(() => attributeField('Node attribute'));
    expect(within(attribute).getByText('Secret')).toBeInTheDocument();
    expect(screen.queryByText(/encrypted/)).toBeNull();
  });
});

/**
 * The dialog reads a draft through the same `describeRule` the row and the
 * rule-set field do, so a rule the LIST would mark as broken cannot be
 * finished from the editor that is holding it. Before this, the dialog ran
 * three checks of its own: a stale entity type was shown as a dead chip,
 * accepted by "Finish and Close", and then immediately marked broken by the
 * row the dialog had just closed onto.
 */
describe('the codebook controls the rule builder does not offer', () => {
  /**
   * A rule is about what the protocol already collects, so there is nothing
   * here to invent a type for — and this picker sits inside a dialog inside a
   * dialog, where a third one would be a stack nobody can see out of. Every
   * other mount of `EntityTypePickerField` offers to make a type and to change
   * the one it holds; this is the one that withdraws both, exactly as
   * Architect's does (`Query/Rules/RuleEditor.tsx:788`,
   * `allowCreation={false}`).
   */
  it('offers neither making a node type nor changing the one a rule names', async () => {
    const user = userEvent.setup();
    renderRuleList([nodeRule(testId('rule-a'))]);

    await openExistingRule(user);

    // The picker itself is there, so the two readings below are about the
    // affordances rather than about a control that never rendered.
    expect(
      await screen.findByRole('radiogroup', { name: 'Node type' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create new node type' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Edit this node type' }),
    ).toBeNull();
  });
});

describe('a rule the codebook has moved out from under', () => {
  it('refuses to finish a rule pointed at a type the codebook has lost', async () => {
    const user = userEvent.setup();
    const stored: RuleDraft = {
      id: testId('rule-a'),
      type: 'node',
      options: { type: GHOST, operator: 'EXISTS' },
    };
    renderRuleList([stored]);

    await openExistingRule(user);
    await finishAndClose(user);

    // Named, not described: "a type" would send the researcher looking through
    // a rule set for which one.
    expect(
      await screen.findByText(
        `This rule is pointed at "${GHOST}", which is no longer in the codebook. Choose another type.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
    // Left exactly as it was found, rather than committed by the refused save.
    expect(probedRuleSet()?.rules).toEqual([stored]);
  });

  it('refuses to finish a presence rule holding an operator it cannot use', async () => {
    const user = userEvent.setup();
    const stored: RuleDraft = {
      id: testId('rule-a'),
      type: 'node',
      // No attribute, so the schema allows only EXISTS/NOT_EXISTS here.
      options: { type: PERSON, operator: 'EXACTLY', value: 3 },
    };
    renderRuleList([stored]);

    await openExistingRule(user);
    await finishAndClose(user);

    expect(
      await screen.findByText(
        'This operator cannot ask whether an entity type is present. Choose another one.',
      ),
    ).toBeInTheDocument();
    expect(probedRuleSet()?.rules).toEqual([stored]);
  });

  /**
   * A rule with no id is the one problem the dialog REPAIRS rather than
   * refuses: nothing on screen asks for an id, so refusing the save would
   * leave the researcher with a rule they could neither fix nor keep. The id
   * is minted for the editing session, before the draft is validated, so the
   * rule the dialog judges is the rule it would save.
   */
  it('gives a rule that arrived without an identifier one, and finishes', async () => {
    const user = userEvent.setup();
    renderRuleList([
      { type: 'node', options: { type: PERSON, operator: 'EXISTS' } },
    ]);

    await openExistingRule(user);
    await finishAndClose(user);

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: RULE_EDITOR }),
      ).not.toBeInTheDocument(),
    );
    const [saved] = probedRuleSet()?.rules ?? [];
    expect(typeof saved?.id).toBe('string');
    expect(saved?.id).not.toBe('');
    expect(saved?.options).toEqual({ type: PERSON, operator: 'EXISTS' });
  });

  /**
   * The dialog's placement table is total over `RULE_PROBLEM_CODES`, so a new
   * problem cannot be added to the rule description and left with nowhere to
   * appear in the editor. Each draft below carries the code under test and,
   * wherever a rule can hold it alone, nothing else — otherwise a code routed
   * nowhere would still "pass" on a neighbour's refusal. `unknownTarget` is
   * the one that cannot stand alone: a rule that does not say what it is about
   * is unfinished by definition.
   */
  describe('every problem a rule can have', () => {
    /**
     * All but one of them. `duplicateId` is not a property of a draft: an id
     * is a duplicate only relative to the rules beside it, and this dialog is
     * handed one rule. It is also not something the dialog ever has to refuse
     * — told that the rule it opened shares its id, it mints a fresh one
     * before it validates, so the draft it judges cannot carry the problem.
     * `RuleSetField`'s "gives one of them a new identifier when it is edited
     * and saved" is where that answer is proved. The placement table still
     * covers the code, because it is total over `RULE_PROBLEM_CODES` and will
     * not compile otherwise.
     */
    type DraftProblemCode = Exclude<RuleProblemCode, 'duplicateId'>;
    const DRAFT_PROBLEM_CODES = RULE_PROBLEM_CODES.filter(
      (code): code is DraftProblemCode => code !== 'duplicateId',
    );

    const DRAFTS: Readonly<Record<DraftProblemCode, RuleDraft>> = {
      unknownTarget: {
        id: testId('rule-1'),
        type: 'chimera',
        options: {},
      },
      missingEntityType: {
        id: testId('rule-1'),
        type: 'node',
        options: { type: GHOST, operator: 'EXISTS' },
      },
      missingAttribute: {
        id: testId('rule-1'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: FAVOURITE_COLOUR,
          operator: 'EXACTLY',
          value: 1,
        },
      },
      // Finished, and about an attribute the codebook still has — which is
      // encrypted, so no filter over interview answers can compare it.
      encryptedAttribute: {
        id: testId('rule-1'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: SECRET,
          operator: 'EXACTLY',
          value: 'blue',
        },
      },
      invalidOperator: {
        id: testId('rule-1'),
        type: 'node',
        // A pattern comparison against an option-bearing attribute: the schema
        // does not allow it, while the operand it was given is still a
        // perfectly good pattern — so this is the code on its own.
        options: {
          type: PERSON,
          attribute: MOOD,
          operator: 'CONTAINS',
          value: 'happy',
        },
      },
      invalidOperand: {
        id: testId('rule-1'),
        type: 'node',
        // A multi-select is answered with the list of options that were
        // selected, so a lone option value is not a shape it can be compared
        // against — but `happy` is still one of the options, so nothing else
        // is wrong with it.
        options: {
          type: PERSON,
          attribute: MOOD,
          operator: 'EXACTLY',
          value: 'happy',
        },
      },
      missingOption: {
        id: testId('rule-1'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: MOOD,
          operator: 'INCLUDES',
          value: ['retired'],
        },
      },
      unusableOption: {
        id: testId('rule-1'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: MOOD,
          operator: 'INCLUDES',
          value: [true],
        },
      },
      incomplete: {
        id: testId('rule-1'),
        type: 'node',
        options: { type: PERSON, attribute: AGE, operator: 'GREATER_THAN' },
      },
      // Nothing about this rule is wrong; the rule set it is sitting in is
      // one the schema does not let it sit in.
      targetNotOffered: {
        id: testId('rule-1'),
        type: 'ego',
        options: { attribute: EGO_NAME, operator: 'EXACTLY', value: 'Ada' },
      },
      // A comparison pattern that will not compile. The interview swallows
      // the compile error on purpose, so nothing downstream reports it.
      invalidPattern: {
        id: testId('rule-1'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: NOTE,
          operator: 'CONTAINS',
          value: '(unclosed',
        },
      },
      // A full date against an attribute whose picker now records years.
      unusableDate: {
        id: testId('rule-1'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: BORN,
          operator: 'EXACTLY',
          value: '2020-05-14',
        },
      },
      // A count of selected options the attribute's own option list puts out
      // of reach: `mood` offers two, so three can never be selected.
      unusableNumber: {
        id: testId('rule-1'),
        type: 'node',
        options: {
          type: PERSON,
          attribute: MOOD,
          operator: 'OPTIONS_EQUALS',
          value: 3,
        },
      },
      // The only part of a rule no control on screen asks for — and the one
      // the protocol schema requires of every rule in both of its shapes.
      missingId: {
        type: 'node',
        options: { type: PERSON, operator: 'EXISTS' },
      },
    };

    /** The controls this dialog names, which is where a refusal has to land. */
    const DIALOG_FIELDS: ReadonlySet<string> = new Set([
      'type',
      'options.type',
      'options.attribute',
      'options.operator',
      RULE_VALUE_FIELD,
    ]);

    it.each(DRAFT_PROBLEM_CODES)('refuses a rule reported as %s', (code) => {
      const rule = DRAFTS[code];

      expect(
        describeRule({
          rule,
          codebook: testCodebook,
          targets: FILTER_TARGETS,
        }).problems[0]?.code,
      ).toBe(code);

      const refusal = ruleDraftRefusal(rule, testCodebook, FILTER_TARGETS);
      const fields = Object.entries(refusal?.fieldErrors ?? {});
      expect(fields).toHaveLength(1);
      const [field, message] = fields[0]!;
      expect(DIALOG_FIELDS.has(field)).toBe(true);
      expect(message).toEqual(expect.stringMatching(/\S/));
    });
  });
});

describe('one editing session per row', () => {
  it('opens the second rule on its own values, not the first rule’s', async () => {
    const user = userEvent.setup();
    renderRuleList([
      nodeRule(testId('rule-a')),
      {
        id: testId('rule-b'),
        type: 'node',
        options: { type: PERSON, operator: 'NOT_EXISTS' },
      },
    ]);

    const editControls = screen.getAllByRole('button', {
      name: /^Edit rule:/,
    });
    expect(editControls).toHaveLength(2);

    await user.click(editControls[0]!);
    await screen.findByRole('dialog', { name: RULE_EDITOR });
    expect(await screen.findByRole('radio', { name: 'exists' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );

    await user.click(
      screen.getAllByRole('button', { name: /^Edit rule:/ })[1]!,
    );
    await screen.findByRole('dialog', { name: RULE_EDITOR });

    // Fresco has no whole-form reinitialise, so a session reused across rows
    // would leave the second rule showing the first one's answers — and save
    // them over it.
    expect(
      await screen.findByRole('radio', { name: 'does not exist' }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: 'exists' })).not.toBeChecked();
  });
});

describe('a choice that invalidates the choices below it', () => {
  it('clears the operator when the attribute it was chosen for changes', async () => {
    const user = userEvent.setup();
    renderRuleList();

    await openNewRule(user);
    await buildNodeAttributeRuleUpTo(user, AGE, 'GREATER_THAN');
    await user.type(
      await screen.findByRole('spinbutton', { name: /Attribute value/ }),
      '30',
    );

    await chooseAttributeById(user, attributeField('Node attribute'), HEIGHT);

    // The new attribute still offers "is greater than", so an operator left
    // standing here would be one carried over rather than one chosen — and the
    // operand entered for the old attribute would be carried with it.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Operator/ })).toHaveValue(
        '',
      ),
    );
    expect(
      screen.queryByRole('spinbutton', { name: /Attribute value/ }),
    ).toBeNull();
  });

  it('drops the attribute a rule about presence never had', async () => {
    const user = userEvent.setup();
    const { onSave } = renderSpiedEditor();

    await buildNodeAttributeRuleUpTo(user, AGE, 'GREATER_THAN');
    await user.click(await screen.findByRole('option', { name: /Presence/ }));
    await user.click(await screen.findByRole('radio', { name: 'exists' }));
    await finishAndClose(user);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // The presence of the KEY — not its value — is what tells the schema and
    // the completeness check that a rule is about an attribute, so a key left
    // behind holding nothing makes a presence rule read as an unfinished
    // attribute rule.
    expect(Object.hasOwn(savedOptions(onSave), 'attribute')).toBe(false);
    expect(savedOptions(onSave)).toEqual({
      type: PERSON,
      operator: 'EXISTS',
    });
  });
});

describe('a rule whose target the editor does not recognise', () => {
  it('refuses it, and names the control that has to be answered', async () => {
    const user = userEvent.setup();
    // A stored rule whose target is not one of the three the schema has. Every
    // control on screen is satisfied — the entity field is holding a
    // non-empty string — so the editor's own completeness check is the only
    // thing standing between this and a saved rule.
    const { onSave } = renderSpiedEditor({ type: 'chimera', options: {} });

    await screen.findByRole('dialog', { name: RULE_EDITOR });
    await finishAndClose(user);

    expect(
      await screen.findByText(
        'This rule cannot be saved until this question is answered.',
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: RULE_EDITOR }),
    ).toBeInTheDocument();
  });
});

describe('saving a rule', () => {
  it('does not also report the session as dismissed', async () => {
    const user = userEvent.setup();
    const { onSave, onCancel } = renderSpiedEditor();

    await buildEgoRuleUpTo(user, 'EXACTLY');
    await user.type(
      await screen.findByRole('textbox', { name: 'Attribute value' }),
      'Alex',
    );
    await finishAndClose(user);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // One session, one outcome. A dismissal arriving after the save would ask
    // the list to discard the row it has just committed.
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the rule the row was edited into, rather than discarding the row', async () => {
    const user = userEvent.setup();
    renderRuleList([nodeRule(testId('rule-a'))]);

    await openExistingRule(user);
    await user.click(
      await screen.findByRole('radio', { name: 'does not exist' }),
    );
    await finishAndClose(user);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: RULE_EDITOR })).toBeNull(),
    );
    // One save, one close: the rule keeps its identity and its new operator,
    // and the row it was edited from is still in the list.
    expect(probedRuleSet()?.rules).toEqual([
      {
        id: testId('rule-a'),
        type: 'node',
        options: { type: PERSON, operator: 'NOT_EXISTS' },
      },
    ]);
  });
});

describe('a layout in the node attribute picker', () => {
  const PLACE = testTypeId('place');
  const SOCIOGRAM = testId('stage/sociogram');

  // A Sociogram places people in `home`, so the layout is one of the
  // person type's attributes and not one of the place type's.
  const renderWithSociogram = () => {
    const sections = ruleSections();
    render(
      <RuleEditorHost
        sections={{
          ...sections,
          [sectionId({ kind: 'stageOrder' })]: {
            stages: ['stage-1', SOCIOGRAM],
          },
          [sectionId({ kind: 'stage', stageId: SOCIOGRAM })]: {
            id: SOCIOGRAM,
            type: 'Sociogram',
            label: { en: 'Sociogram' },
            subject: { entity: 'node', types: [PERSON] },
            layout: HOME,
            background: { concentricCircles: 3 },
            prompts: [
              {
                id: testId('prompt'),
                text: { en: 'Place people' },
                task: 'layout',
              },
            ],
          },
          [sectionId({ kind: 'codebookNode', typeId: PLACE })]: {
            name: 'Place',
            color: 'node-color-seq-3',
            shape: { default: 'circle' },
            variables: {
              [testVariableId('place-name')]: { name: 'Name', type: 'text' },
            },
          },
        }}
      >
        <BuilderSection sectionKey="skip-logic" title="Skip logic">
          <Field
            name={RULE_SET_FIELD}
            label="Rules"
            component={QueryRuleSetField}
          />
        </BuilderSection>
      </RuleEditorHost>,
    );
  };

  const nodeAttributeField = async (
    user: ReturnType<typeof userEvent.setup>,
    typeName: string,
  ) => {
    await openNewRule(user);
    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(await screen.findByRole('radio', { name: typeName }));
    await user.click(await screen.findByRole('option', { name: /Attribute/ }));
    return waitFor(() => attributeField('Node attribute'));
  };

  it('lists a layout a stage places the node type in as unavailable', async () => {
    const user = userEvent.setup();
    renderWithSociogram();
    const field = await nodeAttributeField(user, 'Person');

    expect(await unavailableAttributes(user, field)).toContain(HOME);
    expect(await offeredAttributes(user, field)).not.toContain(HOME);
  });

  it('leaves the layout out for a node type no stage places in it', async () => {
    const user = userEvent.setup();
    renderWithSociogram();
    const field = await nodeAttributeField(user, 'Place');

    expect(await unavailableAttributes(user, field)).not.toContain(HOME);
    expect(await offeredAttributes(user, field)).not.toContain(HOME);
  });
});
