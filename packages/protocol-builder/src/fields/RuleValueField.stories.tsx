import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import type { VariableType } from '@codaco/protocol-validation';

import type { RuleChoiceOption } from '../rules/ruleCodebook.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import {
  emptyRuleValue,
  RULE_VALUE_FIELD,
  RuleOperandField,
} from './RuleValueField.tsx';

/**
 * How a rule about one attribute is read, as the editor above this control
 * has already worked it out.
 *
 * The operand control is handed an attribute type and an operator rather than
 * an attribute: the table upstream has turned those two into a control, an
 * empty value and a reader, and this is what a caller passes. These three are
 * the fixture protocol's own person attributes, so the story shows the
 * comparisons a researcher would really be writing.
 */
type RuleAttribute = Readonly<{
  value: string;
  label: string;
  type: VariableType;
  operator: string;
  options?: readonly RuleChoiceOption[];
}>;

const AGE: RuleAttribute = {
  value: 'age',
  label: 'age',
  type: 'number',
  operator: 'GREATER_THAN',
};

const CONTACT_TYPE: RuleAttribute = {
  value: 'contactType',
  label: 'contactType',
  type: 'categorical',
  operator: 'INCLUDES',
  options: [
    { value: 'in_person', label: 'In person' },
    { value: 'call', label: 'Phone or video call' },
    { value: 'text', label: 'Text or messaging' },
  ],
};

const NAME: RuleAttribute = {
  value: 'name',
  label: 'name',
  type: 'text',
  operator: 'CONTAINS',
};

const ATTRIBUTES: readonly RuleAttribute[] = [AGE, CONTACT_TYPE, NAME];

/**
 * The hint an ego rule's pattern control carries, which the caller supplies:
 * the two rule branches address the researcher about different things, so the
 * sentence is the branch's rather than this control's.
 */
const REG_EXP_HINT = 'Enter a regular expression to compare against.';

/** One operand, for one comparison the editor has already settled. */
function Operand({
  attribute,
  initialValue,
}: Readonly<{ attribute: RuleAttribute; initialValue?: unknown }>) {
  return (
    <RuleOperandField
      variableType={attribute.type}
      operator={attribute.operator}
      {...(attribute.options === undefined
        ? {}
        : { options: attribute.options })}
      {...(initialValue === undefined ? {} : { initialValue })}
      regExpHint={REG_EXP_HINT}
    />
  );
}

/**
 * The attribute above the operand, and the operand following it.
 *
 * The rule editor's own cascade, stood in for: changing the attribute a rule is
 * about empties the operand, because a value entered for one comparison means
 * nothing beside another. That belongs to the dialog rather than to this
 * control — which is told what to render and renders it — so the story empties
 * it through `emptyRuleValue`, the same seam the dialog uses, rather than
 * pretending the field does it.
 */
function OperandUnderItsAttribute() {
  const [attribute, setAttribute] = useState(AGE);
  const setFieldValue = useFormStore((state) => state.setFieldValue);

  return (
    <>
      <UnconnectedField<typeof NativeSelectField>
        name="ruleAttribute"
        component={NativeSelectField}
        label="Attribute this rule is about"
        hint="Chosen one control higher up, in the rule editor."
        options={ATTRIBUTES.map(({ value, label }) => ({ value, label }))}
        value={attribute.value}
        onChange={(next) => {
          const chosen = ATTRIBUTES.find(
            (candidate) => candidate.value === next,
          );
          if (chosen === undefined) return;
          setAttribute(chosen);
          setFieldValue(
            RULE_VALUE_FIELD,
            emptyRuleValue(chosen.type, chosen.operator),
          );
        }}
      />
      <Operand attribute={attribute} />
    </>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Rule value',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The value one rule compares an attribute against. Which control the researcher gets is decided by the attribute and the comparison together, not by the attribute alone: a number is typed, a multiple-choice attribute’s options are ticked from its own list, a pattern is written as a regular expression, and an operator that asks only whether something is present takes no value at all and shows nothing. The words follow the same table, so a comparison the protocol gains cannot arrive with a control and no copy. Every operand a rule asks for has to be answered — the operator would not be comparing anything otherwise.',
      },
    },
  },
  args: {
    stageId: 'information-1',
    // The heading the rule editor gives the section this control sits in.
    sectionTitle: 'Rule structure',
    children: <Operand attribute={AGE} />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A comparison with nothing to compare against yet, which is where every
 * operand starts. The control is numeric because the attribute is answered
 * with a number, and it holds no value rather than a zero: nought is an answer.
 */
export const NothingEnteredYet: Story = {};

/**
 * The operand as the rule was seeded with it. A stored value is read back
 * through the same table that decided the control, so a rule authored
 * elsewhere opens on what it actually holds.
 */
export const TheValueARuleHolds: Story = {
  args: { children: <Operand attribute={AGE} initialValue={65} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('spinbutton', { name: /Attribute value/ }),
    ).toHaveValue(65);
  },
};

/**
 * The options the attribute itself authors, ticked rather than typed: this
 * comparison asks whether the answer is among them, so the operand is a set
 * and the researcher is never asked to spell an option out.
 */
export const AnAttributeWithItsOwnOptions: Story = {
  args: { children: <Operand attribute={CONTACT_TYPE} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('checkbox', { name: 'In person' }),
    );

    await expect(
      canvas.getByRole('checkbox', { name: 'In person' }),
    ).toBeChecked();
    await expect(
      canvas.getByRole('checkbox', { name: 'Text or messaging' }),
    ).not.toBeChecked();
  },
};

/**
 * Changing the attribute a rule is about. The control changes with it — a
 * number box is no way to choose between authored options — and the value
 * entered for the comparison that has gone does not survive into the one that
 * replaced it.
 */
export const TheControlFollowsTheAttribute: Story = {
  args: { children: <OperandUnderItsAttribute /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const number = await canvas.findByRole('spinbutton', {
      name: /Attribute value/,
    });
    await userEvent.type(number, '65');
    await expect(number).toHaveValue(65);

    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Attribute this rule is about' }),
      'contactType',
    );

    // The options that replaced the number box start unticked rather than
    // carrying 65 forward as a selection nobody made, and the box itself is
    // gone with the comparison it belonged to.
    await expect(
      await canvas.findByRole('checkbox', { name: 'In person' }),
    ).not.toBeChecked();
    await expect(
      canvas.queryByRole('spinbutton', { name: /Attribute value/ }),
    ).toBeNull();
  },
};

/**
 * A pattern rather than a value: these two comparisons match text against a
 * regular expression whatever the attribute is answered with, so the box asks
 * for one and the sentence under it says so in the caller's words.
 */
export const APatternToMatchAgainst: Story = {
  args: {
    // A brace rather than a quoted attribute, because the escapes are part of
    // the pattern: JSX would hand the control two backslashes of its own.
    children: <Operand attribute={NAME} initialValue={'^Dr\\.?\\s'} />,
  },
};

/**
 * A comparison that takes no operand at all. "Exists" asks about the thing
 * itself, so there is nothing to enter and nothing is drawn — rather than an
 * empty box the researcher would be right to try filling in.
 */
export const AComparisonThatTakesNoValue: Story = {
  args: {
    children: <Operand attribute={{ ...AGE, operator: 'EXISTS' }} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The editor is drawn — the host's own save is on screen — and the section
    // around the operand holds no control whatever.
    await canvas.findByRole('button', { name: 'Save stage' });
    await expect(canvas.queryByRole('spinbutton')).toBeNull();
    await expect(canvas.queryByRole('textbox')).toBeNull();
    await expect(canvas.queryByRole('checkbox')).toBeNull();
  },
};

/** Held elsewhere: the operand can be read and not entered. */
export const ASpectator: Story = {
  args: {
    readOnly: true,
    children: <Operand attribute={AGE} initialValue={65} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('spinbutton', { name: /Attribute value/ }),
    ).toBeDisabled();
  },
};

/**
 * An operand left unanswered when the save comes. Every comparison that takes
 * a value has to have one — the operator would not be comparing anything
 * otherwise — and the refusal is worded for the researcher authoring the
 * protocol rather than in Fresco's own words, which address a participant
 * answering one.
 */
export const AnOperandNobodyEntered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(
      await canvas.findByText('This field is required.'),
    ).toBeInTheDocument();
  },
};
