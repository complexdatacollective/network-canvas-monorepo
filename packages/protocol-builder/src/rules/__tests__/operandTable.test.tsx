import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import {
  type FilterOperator,
  filterRuleSchema,
  filterValueSchema,
  type VariableType,
  validateProtocol,
  VariableTypesKeys,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import {
  canAuthorRuleForType,
  type OperandControl,
  operandRequirement,
  operatorsForSubject,
  ruleVariableTypes,
} from '../operators.ts';
import type { RuleDraft } from '../rule.ts';
import { isOperandValidForAttributeType } from '../ruleCodebook.ts';
import RuleEditorDialog, { type RuleTypeOption } from '../RuleEditorDialog.tsx';

/**
 * One attribute of every type the schema has, so the sweep below covers the
 * catalogue rather than a selection from it.
 *
 * The names are what the picker shows; the ids are what a rule stores.
 */
const ATTRIBUTES: Readonly<Record<VariableType, string>> = Object.freeze({
  boolean: 'flag',
  text: 'note',
  number: 'age',
  scalar: 'closeness',
  datetime: 'born',
  ordinal: 'band',
  categorical: 'mood',
  location: 'place',
  layout: 'spot',
});

const personVariables: SectionDoc['variables'] = {
  flag: { name: 'Flag', type: 'boolean', component: 'Boolean' },
  note: { name: 'Note', type: 'text', component: 'Text' },
  age: { name: 'Age', type: 'number', component: 'Number' },
  closeness: {
    name: 'Closeness',
    type: 'scalar',
    component: 'VisualAnalogScale',
  },
  born: { name: 'Born', type: 'datetime', component: 'DatePicker' },
  band: {
    name: 'Band',
    type: 'ordinal',
    component: 'RadioGroup',
    options: [
      { label: 'Low', value: 1 },
      { label: 'High', value: 2 },
    ],
  },
  mood: {
    name: 'Mood',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [
      { label: 'Happy', value: 'happy' },
      { label: 'Sad', value: 'sad' },
    ],
  },
  // The two the schema calls non-renderable: they are recorded by the stage
  // that captures them rather than by a form control, so they carry none.
  place: { name: 'Place', type: 'location' },
  spot: { name: 'Spot', type: 'layout' },
};

const personDefinition = {
  name: 'Person',
  color: 'node-color-seq-2',
  shape: { default: 'square' },
  variables: personVariables,
} as const;

const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const stageFields: SectionDoc = {
  label: 'Details',
  subject: { entity: 'node', type: 'person' },
  form: { fields: [{ variable: 'age', prompt: 'How old are they?' }] },
  introductionPanel: { title: 'About them', text: 'A few questions.' },
};

const baseSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Operand table', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: { id: 'stage-1', type: 'AlterForm', ...stageFields },
  [personSection]: personDefinition,
};

const codebook = { node: { person: personDefinition } };

const RULE_TYPES: readonly RuleTypeOption[] = [
  {
    label: 'Node - match a node type or one of its attributes.',
    value: 'node',
  },
];

function createSession() {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('AlterForm', () => 'stage-1'),
    fields: stageFields,
    protocolSections: baseSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Operand table',
      schemaVersion: 8,
      codebook,
      stages: [stageDocument],
    }),
  });
}

function Editor({ onSave }: { onSave: (rule: RuleDraft) => void }) {
  const [session] = useState(() => createSession());
  const controller = useStageEditorController(session, 'stage-form');
  const [open, setOpen] = useState(true);

  return (
    <StageEditorShell controller={controller}>
      <RuleEditorDialog
        open={open}
        seed={{ type: '' }}
        ruleTypes={RULE_TYPES}
        onSave={(rule) => {
          onSave(rule);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </StageEditorShell>
  );
}

const renderEditor = () => {
  const onSave = vi.fn<(rule: RuleDraft) => void>();
  render(
    <DialogProvider>
      <Editor onSave={onSave} />
    </DialogProvider>,
  );
  return onSave;
};

type User = ReturnType<typeof userEvent.setup>;

/**
 * One representative operand per control, entered the way a researcher enters
 * it.
 *
 * Keyed by the CONTROL rather than by the attribute type, because the control
 * is what the operand table decides and what the researcher actually meets: a
 * type that is later given a different control is answered here without this
 * sweep having to learn about the type at all.
 */
const ENTER_OPERAND: Readonly<
  Record<OperandControl, (user: User) => Promise<void>>
> = Object.freeze({
  boolean: async (user) => {
    await user.click(await screen.findByRole('radio', { name: 'Yes' }));
  },
  optionList: async (user) => {
    await user.click(await screen.findByRole('checkbox', { name: 'Happy' }));
  },
  option: async (user) => {
    await user.click(await screen.findByRole('radio', { name: 'Low' }));
  },
  date: async () => {
    // A date input has no ARIA role of its own, so it is found by the label
    // the field gives it. Set in one go: a date is not entered a character
    // at a time, and every intermediate reading would be an invalid date.
    fireEvent.change(await screen.findByLabelText(/Attribute value/), {
      target: { value: '2020-01-01' },
    });
  },
  decimalNumber: async () => {
    fireEvent.change(
      await screen.findByRole('spinbutton', { name: /Attribute value/ }),
      { target: { value: '0.5' } },
    );
  },
  wholeNumber: async () => {
    fireEvent.change(
      await screen.findByRole('spinbutton', {
        name: /Selected option count|Attribute value/,
      }),
      { target: { value: '2' } },
    );
  },
  text: async (user) => {
    await user.type(
      await screen.findByRole('textbox', { name: /Attribute value/ }),
      'Amsterdam',
    );
  },
  pattern: async (user) => {
    await user.type(
      await screen.findByRole('textbox', { name: /Attribute value/ }),
      'ams',
    );
  },
});

const buildRule = async (
  user: User,
  attribute: string,
  operator: FilterOperator,
) => {
  await user.click(
    screen.getByRole('radio', {
      name: 'Node - match a node type or one of its attributes.',
    }),
  );
  await user.click(await screen.findByRole('radio', { name: 'Person' }));
  await user.click(await screen.findByRole('option', { name: /Attribute/ }));
  await user.selectOptions(
    await screen.findByRole('combobox', { name: /Node attribute/ }),
    attribute,
  );
  await user.selectOptions(
    await screen.findByRole('combobox', { name: /Operator/ }),
    operator,
  );
};

/**
 * The stage the committed rule filters, as a protocol the validator reads.
 *
 * Deliberately `unknown`: the point of handing it to `validateProtocol` is to
 * find out whether it IS a valid protocol, and a fixture typed as one would
 * have the question answered by the compiler instead.
 */
const protocolWith = (rule: RuleDraft): unknown => ({
  name: 'Operand table',
  schemaVersion: 8,
  codebook,
  stages: [
    {
      id: 'stage-1',
      type: 'AlterForm',
      ...stageFields,
      filter: { rules: [rule] },
    },
  ],
});

const validationIssues = async (rule: RuleDraft): Promise<string[]> => {
  const result = await validateProtocol(
    protocolWith(rule) as Parameters<typeof validateProtocol>[0],
  );
  return result.success
    ? []
    : result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
};

/**
 * Every attribute type the schema has, against every operator the editor
 * offers for it.
 *
 * The sweep exists because each hole the reviewers found was the same hole in
 * a different cell: a type or an operator whose operand fell through to the
 * free-text control and committed a value the protocol schema then refused. A
 * type or an operator added to the schema arrives here on its own, and a cell
 * with no control and no representative value fails rather than falling
 * through.
 */
const cases = VariableTypesKeys.flatMap((variableType) =>
  [...operatorsForSubject(variableType)].map(
    (operator) => [variableType, operator] as const,
  ),
);

describe('the operand every offered rule commits', () => {
  it('sweeps every type the schema has', () => {
    // The sweep is only exhaustive if it actually enumerates the catalogue.
    expect(new Set(cases.map(([type]) => type))).toEqual(
      new Set(ruleVariableTypes),
    );
    expect(cases.length).toBeGreaterThan(VariableTypesKeys.length);
  });

  it.each(cases)(
    'commits a %s operand the protocol schema accepts for %s',
    async (variableType, operator) => {
      const requirement = operandRequirement(variableType, operator);
      expect(requirement).toBeDefined();
      expect(requirement?.kind).toBe('value');

      const user = userEvent.setup();
      const onSave = renderEditor();

      await buildRule(user, ATTRIBUTES[variableType], operator);
      if (requirement?.kind === 'value') {
        await ENTER_OPERAND[requirement.control](user);
      }
      await user.click(
        screen.getByRole('button', { name: 'Finish and Close' }),
      );

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const rule = onSave.mock.calls[0]?.[0];
      expect(rule).toBeDefined();

      // The value the editor committed is one the protocol may hold...
      expect(filterValueSchema.safeParse(rule?.options?.value).success).toBe(
        true,
      );
      // ...the rule is one the filter schema accepts...
      expect(filterRuleSchema.safeParse(rule).success).toBe(true);
      // ...and the whole protocol validates, which is where the per-operator
      // operand rules live: a relational operator holding a date string, or a
      // count holding a fraction, is refused here and nowhere earlier.
      expect(await validationIssues(rule!)).toEqual([]);
    },
  );
});

/**
 * The other half of the sweep above: what the field holds BEFORE the
 * researcher has entered anything.
 *
 * Every operand is required, and `required` is the only thing standing between
 * an untouched operand and a saved rule. It reads emptiness through Fresco's
 * own `isUnanswered`, so an empty sentinel that is a real answer — `false`,
 * which is exactly what a yes/no control commits for "No" — satisfies the rule
 * the moment an operator is chosen, and the researcher is never asked.
 */
describe('the operand every offered rule starts empty', () => {
  it.each(cases)(
    'empties a %s operand for %s to something the form reads as unanswered',
    (variableType, operator) => {
      const requirement = operandRequirement(variableType, operator);
      expect(requirement?.kind).toBe('value');
      if (requirement?.kind !== 'value') return;
      expect(isUnanswered(requirement.empty)).toBe(true);
    },
  );
});

describe('an attribute the protocol can hold no operand for', () => {
  it('offers a layout attribute no operator, and so does not offer it at all', () => {
    // Every operator the schema allows a layout attribute compares the operand
    // against the ANSWER, and a layout answer is a point. `filterValueSchema`
    // holds numbers, strings, booleans and lists — never an object — so there
    // is no value a rule could carry, and a text box beside one commits a
    // string that can never equal `{ x, y }`.
    expect([...operatorsForSubject('layout')]).toEqual([]);
    expect(ruleVariableTypes).not.toContain('layout');
    expect(canAuthorRuleForType('layout')).toBe(false);
    // And a rule a protocol already holds against one is REPORTED rather than
    // passed as text: the string a free-text operand commits validates against
    // the schema perfectly well, and can never equal `{ x, y }`, so the
    // builder is the only place it can be caught.
    expect(isOperandValidForAttributeType('EXACTLY', 'layout', '0.5')).toBe(
      false,
    );
  });

  it('offers a date attribute no comparison the validator would refuse', () => {
    // The schema allows a datetime the relational operators, but requires a
    // NUMBER beside them — and a date answer compared against a number is not
    // a comparison a researcher can express. Equality is offered, with a date
    // control, because a datetime answer is the date string it compares to.
    expect([...operatorsForSubject('datetime')]).toEqual(['EXACTLY', 'NOT']);
    expect(operandRequirement('datetime', 'GREATER_THAN')).toBeUndefined();
    expect(operandRequirement('datetime', 'EXACTLY')).toMatchObject({
      control: 'date',
    });
  });
});
