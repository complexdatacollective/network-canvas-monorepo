import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import DraftValidationRulesField, {
  draftRulesIssue,
} from './DraftValidationRulesField.tsx';

/** Where a form-fields row keeps the rules of an attribute it is inventing. */
const RULES_FIELD = '_newVariableValidation';

/**
 * The codebook this invention would join, as a row would hand it over: the
 * comparison rules offer these, and nothing else.
 */
const SIBLINGS: Readonly<Record<string, unknown>> = {
  nickname: { name: 'Nickname', type: 'text', component: 'Text' },
  street: { name: 'Street', type: 'text', component: 'Text' },
};

const INVENTED_NAME = 'Middle name';

function DraftRules({
  initialValue,
  allVariables = SIBLINGS,
}: Readonly<{
  initialValue?: Record<string, unknown>;
  allVariables?: Readonly<Record<string, unknown>>;
}>) {
  return (
    <Field<typeof DraftValidationRulesField>
      name={RULES_FIELD}
      component={DraftValidationRulesField}
      label="Validation rules"
      hint="Enable one or more validation rules to apply to this attribute."
      entity="node"
      variableType="text"
      allVariables={allVariables}
      {...(initialValue === undefined ? {} : { initialValue })}
      custom={messageRuleValidation([
        (value: unknown) =>
          draftRulesIssue({
            value,
            variableType: 'text',
            variableName: INVENTED_NAME,
            allVariables,
          }),
      ])}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Draft validation rules',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The rules an answer has to satisfy, for an attribute that does not exist yet. A form-field row that is inventing an attribute holds them here until its own save creates the attribute and writes them with it, so nothing is written to the codebook while the researcher is still authoring. Each rule is a switch with its value beside it; a rule switched on and left unanswered is kept on screen rather than quietly dropped, and the row’s save is refused while one is there.',
      },
    },
  },
  args: {
    stageId: 'ego-form-1',
    sectionTitle: 'Validation',
    children: <DraftRules />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing chosen yet: every rule the kind of answer allows, all switched off. */
export const NoRulesYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the field is drawn a
    // turn after the story mounts. Every play in this file awaits its FIRST
    // query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('switch', { name: 'Required answer' }),
    ).not.toBeChecked();
    await expect(
      canvas.getByRole('switch', { name: 'Minimum text length' }),
    ).not.toBeChecked();
    await expect(canvas.queryAllByRole('spinbutton')).toHaveLength(0);
  },
};

/** Rules the row already holds, each showing the value it was given. */
export const RulesTheRowHolds: Story = {
  args: {
    children: <DraftRules initialValue={{ required: true, minLength: 3 }} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('switch', { name: 'Required answer' }),
    ).toBeChecked();
    await expect(
      canvas.getByRole('spinbutton', { name: 'Minimum text length' }),
    ).toHaveValue(3);
  },
};

/**
 * Switching a rule on gives it a value straight away, so the rule is never in
 * force with nothing to enforce.
 */
export const SwitchingARuleOn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('switch', { name: 'Minimum text length' }),
    );

    await expect(
      await canvas.findByRole('spinbutton', { name: 'Minimum text length' }),
    ).toHaveValue(1);
  },
};

/**
 * A rule switched on and left empty is kept, and the row that would write it
 * says so on the rule's own line rather than dropping it without a word.
 */
export const ARuleLeftUnanswered: Story = {
  args: {
    children: <DraftRules initialValue={{ minLength: 3 }} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('spinbutton', {
      name: 'Minimum text length',
    });
    await userEvent.clear(box);
    await userEvent.tab();

    await expect(
      canvas.getByRole('switch', { name: 'Minimum text length' }),
    ).toBeChecked();
    await expect(
      canvas.getByRole('spinbutton', { name: 'Minimum text length' }),
    ).toHaveAccessibleDescription(
      'Enter a value for "Minimum text length", or switch the rule off.',
    );
  },
};

/**
 * A comparison rule with nothing of the same kind to point at cannot be
 * switched on, and says which of the two reasons it is.
 */
export const NothingToCompareAgainst: Story = {
  args: {
    children: <DraftRules allVariables={{}} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('switch', {
        name: 'Different from another attribute',
      }),
    ).toHaveAccessibleDescription(
      'No other attribute of this type exists to compare against.',
    );
  },
};

/** Held elsewhere: every rule is there to read and none of them can be moved. */
export const ASpectator: Story = {
  args: {
    readOnly: true,
    children: <DraftRules initialValue={{ required: true }} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('switch', { name: 'Required answer' }),
    ).toBeDisabled();
  },
};
