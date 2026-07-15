import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { action } from 'storybook/actions';
import { expect, userEvent, within } from 'storybook/test';

import Button from '../../Button';
import InputField from '../fields/InputField';
import ToggleField from '../fields/ToggleField';
import Form from '../Form';
import SubmitButton from '../SubmitButton';
import Field from './Field';
import UnconnectedField from './UnconnectedField';

const componentMap = {
  InputField,
  ToggleField,
} as const;

type ComponentKey = keyof typeof componentMap;

/**
 * The Field system provides consistent layout and labeling for form controls.
 *
 * - **BaseField** — Internal layout primitive. Renders the label, hint,
 *   control, and error slots. Not used directly by consumers.
 * - **Field** — Connected field that integrates with form context via
 *   `useField`. Provides automatic state management, validation, and error
 *   display. Use inside a `<Form>`.
 * - **UnconnectedField** — Standalone field with the same layout but no form
 *   context. Use for controlled inputs outside of `<Form>`, such as in wizard
 *   steps or settings panels.
 *
 * Both Field and UnconnectedField accept an `inline` prop that places the
 * label and control on the same horizontal row.
 *
 * In addition to the props listed below, Field and UnconnectedField accept
 * any prop that is valid for the `component` passed to them. These are
 * forwarded directly to the underlying control (e.g. `size`, `placeholder`,
 * `minValue`).
 *
 * The connected `Field` component also supports `showValidationHints`, which
 * renders a human-readable summary of the field's validation rules (e.g.
 * "required", "minimum 3 characters") below the hint text. This is only
 * available within a `<Form>` context since it relies on the validation
 * props passed to `useField`.
 */
const meta: Meta = {
  title: 'Systems/Form/Field',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    component: {
      control: 'select',
      options: ['InputField', 'ToggleField'],
      description: 'The field component to render',
      table: {
        type: { summary: 'React.ComponentType' },
        defaultValue: { summary: 'InputField' },
      },
    },
    name: {
      control: 'text',
      description: 'Unique field name, used as the key in form state',
      table: {
        type: { summary: 'string' },
        category: 'Field Props',
      },
    },
    label: {
      control: 'text',
      description:
        'Label text rendered above (or beside when inline) the control',
      table: {
        type: { summary: 'string' },
        category: 'Field Props',
      },
    },
    hint: {
      control: 'text',
      description:
        'Supplementary text rendered below the label (or below the label group when inline)',
      table: {
        type: { summary: 'ReactNode' },
        category: 'Field Props',
      },
    },
    inline: {
      control: 'boolean',
      description:
        'When true, renders the label/hint and control on the same horizontal row with space between',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
        category: 'Field Props',
      },
    },
    labelHidden: {
      control: 'boolean',
      description:
        "Visually hides the label while keeping it as the control's accessible name. Use when a surrounding heading already names the field, so the redundant visible label is dropped without stripping the screen-reader name.",
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
        category: 'Field Props',
      },
    },
    disabled: {
      control: 'boolean',
      description: 'Prevents user interaction and dims the control',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
        category: 'Field Props',
      },
    },
    readOnly: {
      control: 'boolean',
      description: 'Allows the value to be read but not changed',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
        category: 'Field Props',
      },
    },
    error: {
      control: 'text',
      description: 'Error message to display below the field',
      table: {
        type: { summary: 'string[]' },
        category: 'Field Props',
      },
    },
    showValidationHints: {
      control: false,
      description:
        'When true, renders a human-readable summary of the field\'s validation rules (e.g. "required", "between 8 and 64 characters") below the hint. Only available on the connected Field component inside a Form.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
        category: 'Field Props (connected only)',
      },
    },
    validateOnChange: {
      control: false,
      description:
        'When true, validates the field on change instead of waiting for blur. Validation is debounced. Only available on the connected Field component inside a Form.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
        category: 'Field Props (connected only)',
      },
    },
    validateOnChangeDelay: {
      control: false,
      description:
        'Debounce delay in milliseconds for validateOnChange. Only applies when validateOnChange is true.',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '300' },
        category: 'Field Props (connected only)',
      },
    },
    validationContext: {
      control: false,
      description:
        'Context required for context-dependent validations like unique, sameAs, etc.',
      table: {
        type: { summary: 'ValidationContext' },
        category: 'Field Props (connected only)',
      },
    },
  },
  args: {
    component: 'InputField',
    name: 'demo-field',
    inline: false,
    label: 'Username',
    labelHidden: false,
    hint: 'Choose a unique username.',
    disabled: false,
    readOnly: false,
    error: '',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const component = (args.component ?? 'InputField') as ComponentKey;
    const inline = args.inline as boolean;
    const label = (args.label ?? 'Username') as string;
    const labelHidden = args.labelHidden as boolean;
    const hint = (args.hint ?? '') as string;
    const error = (args.error ?? '') as string;
    const disabled = args.disabled as boolean;
    const readOnly = args.readOnly as boolean;
    const [textValue, setTextValue] = useState('');
    const [toggleValue, setToggleValue] = useState(false);

    const Component = componentMap[component];

    const valueProps = (() => {
      switch (component) {
        case 'ToggleField':
          return {
            value: toggleValue,
            onChange: (v: boolean | undefined) => setToggleValue(v ?? false),
          };
        case 'InputField':
          return {
            value: textValue,
            onChange: (v: string | undefined) => setTextValue(v ?? ''),
          };
      }
    })();

    return (
      <div className="max-w-lg">
        <UnconnectedField
          name="demo-field"
          label={label}
          labelHidden={labelHidden}
          hint={hint}
          inline={inline}
          component={Component}
          disabled={disabled}
          readOnly={readOnly}
          errors={error ? [error] : undefined}
          showErrors={!!error}
          {...valueProps}
        />
      </div>
    );
  },
};

/**
 * Demonstrates the `hint` prop on a connected Field inside a Form.
 * The hint provides supplementary guidance below the label.
 */
export const WithHint: Story = {
  render: () => (
    <div className="max-w-lg">
      <Form
        onSubmit={(data) => {
          action('form-submitted')(data);
          return { success: true };
        }}
      >
        <Field
          name="username"
          label="Username"
          hint="Must be between 3 and 20 characters. Only letters, numbers, and underscores."
          component={InputField}
          required
          minLength={3}
          maxLength={20}
        />
        <Field
          name="bio"
          label="Bio"
          hint="Tell us a bit about yourself."
          component={InputField}
          maxLength={200}
        />
        <SubmitButton>Submit</SubmitButton>
      </Form>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The `hint` prop renders supplementary text below the label. It accepts a `ReactNode` so you can pass plain text or formatted content.',
      },
    },
  },
};

/**
 * Demonstrates `labelHidden`. When a surrounding heading already names the
 * field, the visible label is redundant — but removing it outright would
 * strip the control's accessible name. `labelHidden` keeps the label in the
 * accessibility tree (as the control's `aria-labelledby` target) while hiding
 * it visually, so screen-reader users still hear a name.
 */
export const LabelHidden: Story = {
  render: () => (
    <div className="max-w-lg">
      <h4 className="mb-2 font-bold uppercase">Prompt text</h4>
      <UnconnectedField
        name="prompt-text"
        label="Prompt text"
        labelHidden
        hint="A heading above already names this field, so its label is hidden."
        component={InputField}
        value="Sort the people you named…"
        onChange={action('changed')}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The control keeps its accessible name even though no label is visible.
    const input = canvas.getByRole('textbox', { name: 'Prompt text' });
    await expect(input).toBeInTheDocument();
    // The label element is present but visually hidden (sr-only).
    const label = canvasElement.querySelector('label');
    await expect(label).not.toBeNull();
    await expect(label).toHaveClass('sr-only');
  },
  parameters: {
    docs: {
      description: {
        story:
          'Set `labelHidden` when a nearby heading already names the field. The label stays in the accessibility tree (so the control keeps an accessible name) but is not shown, removing the visual redundancy of a heading and a label that say the same thing.',
      },
    },
  },
};

/**
 * Demonstrates the `showValidationHints` prop on a connected Field.
 * When enabled, a human-readable summary of the validation rules is
 * rendered below the hint text (e.g. "Enter at least 3 characters.").
 */
export const WithValidationHints: Story = {
  render: () => (
    <div className="max-w-lg">
      <Form
        onSubmit={(data) => {
          action('form-submitted')(data);
          return { success: true };
        }}
      >
        <Field
          name="username"
          label="Username"
          hint="Choose a unique username."
          component={InputField}
          showValidationHints
          required
          minLength={3}
          maxLength={20}
        />
        <Field
          name="email"
          label="Email"
          hint="We'll use this to contact you."
          component={InputField}
          showValidationHints
          required
          minLength={5}
          maxLength={254}
        />
        <Field
          name="no-validations"
          label="Nickname (optional)"
          hint="This field has no validation rules, so no hints are shown even with showValidationHints."
          component={InputField}
          showValidationHints
        />
        <SubmitButton>Submit</SubmitButton>
      </Form>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "When `showValidationHints` is true, a bulleted list of the field's validation requirements appears below the hint. This helps participants understand what is expected before they start typing. Fields with no validation rules show nothing extra.",
      },
    },
  },
};

/**
 * Shows how `hint` and `showValidationHints` work together — the hint
 * appears first, followed by the auto-generated validation summary.
 */
export const HintWithValidationHints: Story = {
  render: () => (
    <div className="max-w-lg">
      <Form
        onSubmit={(data) => {
          action('form-submitted')(data);
          return { success: true };
        }}
      >
        <Field
          name="password"
          label="Password"
          hint="Use a mix of letters, numbers, and symbols for a strong password."
          component={InputField}
          showValidationHints
          required
          minLength={8}
          maxLength={64}
        />
        <SubmitButton>Submit</SubmitButton>
      </Form>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'When both `hint` and `showValidationHints` are set, the hint text appears first, followed by the auto-generated validation rule summary.',
      },
    },
  },
};

/**
 * Demonstrates how markdown formatting renders in field labels and hints.
 * Both support a subset of markdown: **bold** and *italic*
 *
 * **Known issue:** All label text currently renders bold because the
 * parent `<label>` element applies `font-bold`, overriding markdown
 * formatting like *italic*.
 */
export const UsingMarkdown: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col">
      <UnconnectedField
        name="plain"
        label="Plain label with no formatting"
        hint="Plain hint with no formatting"
        component={InputField}
      />
      <UnconnectedField
        name="italic"
        label="This has *italic* text"
        hint="This has *italic* text"
        component={InputField}
      />
      <UnconnectedField
        name="bold"
        label="This has **bold** text"
        hint="This has **bold** text"
        component={InputField}
      />
      <UnconnectedField
        name="mixed"
        label="Mix of **bold** and *italic* in one label"
        hint="Mix of **bold** and *italic* in one hint"
        component={InputField}
      />
      <UnconnectedField
        name="all-italic"
        label="*Entire label is italic*"
        hint="*Entire hint is italic*"
        component={InputField}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Field labels and hints are rendered with ReactMarkdown, supporting `*italic*` and `**bold**`. This story demonstrates markdown rendering in both.',
      },
    },
  },
};

/**
 * A control rendered in a field's prefix/suffix slot is part of the field: the
 * **field container** is the unit of focus for validation, not the `<input>`.
 *
 * A function slot receives a `FieldSlotController` so it can set the value
 * without importing the form store. Because `setValue` routes through the
 * field's change handler, a generated value clears any pre-existing error.
 *
 * The play function reproduces the original bug (a "Generate" button leaving a
 * stale "cannot be empty" error) and proves it no longer happens — for the
 * keyboard path: tabbing input → button does not validate, and there is no
 * error flash.
 */
export const SlotControllerNoStaleError: Story = {
  name: 'Slot controller — no stale validation error',
  render: () => (
    <div className="max-w-lg">
      <Form
        onSubmit={(data) => {
          action('form-submitted')(data);
          return { success: true };
        }}
      >
        <Field
          name="identifier"
          label="Identifier"
          hint="Generate an identifier, or type your own."
          component={InputField}
          required="Identifier cannot be empty"
          suffixComponent={(field) => (
            <Button
              size="sm"
              variant="text"
              onClick={() => field.setValue('p-generated')}
            >
              Generate
            </Button>
          )}
        />
        <SubmitButton>Submit</SubmitButton>
      </Form>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');
    const generate = canvas.getByRole('button', { name: 'Generate' });

    // Touch the required field, then leave it empty.
    await userEvent.click(input);
    await userEvent.type(input, 'x');
    await userEvent.clear(input);

    // Tab from the input to the in-field Generate button. Focus is still
    // inside the field, so no validation fires — no error flash.
    await userEvent.tab();
    await expect(generate).toHaveFocus();
    await expect(
      canvas.queryByText('Identifier cannot be empty'),
    ).not.toBeInTheDocument();

    // Activate Generate from the keyboard → the value is set.
    await userEvent.keyboard('{Enter}');
    await expect(input).toHaveValue('p-generated');

    // Tab out of the field → validates the now-valid value, still no error.
    await userEvent.tab();
    await expect(
      canvas.queryByText('Identifier cannot be empty'),
    ).not.toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          'Slot controls (Generate buttons, clear, the number steppers) are real tab stops with native button semantics — no `tabindex=-1`, no `mousedown` preventDefault. With container-scoped validation, tabbing from the input to a slot control no longer mis-fires validation, and a function slot can set + validate the value via the injected `FieldSlotController`.',
      },
    },
  },
};

/**
 * InputField applies ArrowUp/ArrowDown through the same native stepUp/stepDown
 * path as its +/- buttons, keeping the controlled value in sync. The buttons
 * are redundant pointer affordances (`tabIndex=-1`), and because they are
 * in-field controls, clicking them does not fire premature validation.
 */
export const NumberStepperKeyboard: Story = {
  name: 'Number steppers — keyboard + no premature validation',
  render: () => (
    <div className="max-w-lg">
      <Form
        onSubmit={(data) => {
          action('form-submitted')(data);
          return { success: true };
        }}
      >
        <Field
          name="count"
          label="Count"
          component={InputField}
          type="number"
          required
          min={0}
          max={10}
          initialValue="5"
        />
        <SubmitButton>Submit</SubmitButton>
      </Form>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('spinbutton');

    // Clicking the field focuses the native number input, which owns
    // ArrowUp/ArrowDown stepping. Native stepping fires only for trusted key
    // events, so it cannot be driven from here; focus targeting is what makes
    // it reachable for real keyboards.
    await userEvent.click(input);
    await expect(input).toHaveFocus();

    // The +/- buttons step the value; being in-field controls, moving focus
    // to them does not trigger premature validation.
    await userEvent.click(canvas.getByLabelText('Increase value'));
    await expect(input).toHaveValue(6);
    await userEvent.click(canvas.getByLabelText('Decrease value'));
    await userEvent.click(canvas.getByLabelText('Decrease value'));
    await expect(input).toHaveValue(4);
    await expect(
      canvas.queryByText('You must answer this question before continuing.'),
    ).not.toBeInTheDocument();
  },
};
