/**
 * # useProtocolForm Hook
 *
 * The `useProtocolForm` hook bridges Network Canvas protocol definitions and the
 * Fresco form system. It automatically generates `<Field>` components from
 * protocol field configurations, including proper input types and validation.
 *
 * ## When to Use
 *
 * Use `useProtocolForm` when rendering forms defined in Network Canvas protocols,
 * such as:
 * - Name Generator node forms
 * - Ego forms
 * - Any interview stage that collects structured data
 *
 * ## How It Works
 *
 * 1. **Takes protocol field definitions** - Array of `{ variable, prompt, hint?, showValidationHints? }` objects, where `prompt` and `hint` are localized strings such as `{ en: 'What is your name?' }`
 * 2. **Looks up variable metadata** - Uses Redux selectors to get codebook info
 * 3. **Maps to form components** - Converts protocol types to form field components
 * 4. **Extracts validation** - Pulls validation rules from variable definitions
 * 5. **Returns rendered fields** - Ready-to-use `<Field>` components
 *
 * ## Protocol Component Mapping
 *
 * | Protocol Component | Form Field |
 * |-------------------|------------|
 * | `Text` | InputField |
 * | `TextArea` | TextAreaField |
 * | `Number` | InputField (number) |
 * | `RadioGroup` | RadioGroupField |
 * | `CheckboxGroup` | CheckboxGroupField |
 * | `Boolean` | BooleanField |
 * | `Toggle` | ToggleField |
 * | `ToggleButtonGroup` | ToggleButtonGroupField |
 * | `DatePicker` | DatePickerField |
 * | `RelativeDatePicker` | RelativeDatePickerField |
 * | `VisualAnalogScale` | VisualAnalogScaleField |
 * | `LikertScale` | LikertScaleField |
 *
 * ## Validation Extraction
 *
 * The hook automatically extracts these validations from protocol definitions:
 * - `required`, `minLength`, `maxLength`
 * - `minValue`, `maxValue`
 * - `minSelected`, `maxSelected`
 * - `unique`, `sameAs`, `differentFrom`
 * - `greaterThanVariable`, `lessThanVariable`
 *
 * ## Usage Example
 *
 * ```tsx
 * function NodeForm({ fields, onSubmit }) {
 *   const { fieldComponents } = useProtocolForm({
 *     fields,
 *     autoFocus: true,
 *     initialValues: existingNode?.attributes,
 *   });
 *
 *   return (
 *     <Form onSubmit={onSubmit}>
 *       {fieldComponents}
 *       <SubmitButton>Save</SubmitButton>
 *     </Form>
 *   );
 * }
 * ```
 *
 * ## Important Notes
 *
 * - Requires Redux context with `protocol` and `session` slices
 * - Requires a `ProtocolLocalizationProvider`, which resolves the localized prompts, hints and option labels
 * - Context-dependent validations (unique, sameAs) need network data in store
 * - The hook uses the protocol's codebook to determine field types and options
 */

import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { action } from 'storybook/actions';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  asEntityAttributeReference,
  type Form as TForm,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../__tests__/testIds';
import useProtocolForm from './useProtocolForm';

const PERSON = testTypeId('person');

// Mock protocol data
const mockProtocol = {
  name: 'Test Protocol',
  codebook: {
    node: {
      [PERSON]: {
        name: 'Person',
        displayVariable: testVariableId('name'),
        iconVariant: 'add-a-person',
        variables: {
          [testVariableId('name')]: {
            [testVariableId('name')]: 'Name',
            type: 'text',
            component: 'Text',
            validation: {
              required: true,
              minLength: 2,
              maxLength: 100,
            },
          },
          [testVariableId('email')]: {
            [testVariableId('name')]: 'Email',
            type: 'text',
            component: 'Text',
            validation: {
              required: true,
            },
          },
          [testVariableId('age')]: {
            [testVariableId('name')]: 'Age',
            type: 'number',
            component: 'Number',
            validation: {
              minValue: 18,
              maxValue: 100,
            },
          },
          [testVariableId('gender')]: {
            [testVariableId('name')]: 'Gender',
            type: 'categorical',
            component: 'RadioGroup',
            options: [
              { label: { en: 'Male' }, value: 'male' },
              { label: { en: 'Female' }, value: 'female' },
              { label: { en: 'Non-binary' }, value: 'non_binary' },
              { label: { en: 'Prefer not to say' }, value: 'prefer_not_say' },
            ],
            validation: {
              required: true,
            },
          },
          [testVariableId('occupation')]: {
            [testVariableId('name')]: 'Occupation',
            type: 'text',
            component: 'Text',
          },
          [testVariableId('favoriteColors')]: {
            [testVariableId('name')]: 'Favorite Colors',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: { en: 'Red' }, value: 'red' },
              { label: { en: 'Blue' }, value: 'blue' },
              { label: { en: 'Green' }, value: 'green' },
              { label: { en: 'Yellow' }, value: 'yellow' },
              { label: { en: 'Purple' }, value: 'purple' },
              { label: { en: 'Orange' }, value: 'orange' },
              { label: { en: 'Pink' }, value: 'pink' },
            ],
            validation: {
              minSelected: 1,
              maxSelected: 3,
            },
          },
          [testVariableId('birthDate')]: {
            [testVariableId('name')]: 'Birth Date',
            type: 'datetime',
            component: 'DatePicker',
            parameters: {
              type: 'date',
              min: '1920-01-01',
              max: '2010-12-31',
            },
          },
          [testVariableId('startDate')]: {
            [testVariableId('name')]: 'Start Date',
            type: 'datetime',
            component: 'RelativeDatePicker',
            parameters: {
              anchor: '2026-01-01',
              before: 30,
              after: 90,
            },
          },
          [testVariableId('happiness')]: {
            [testVariableId('name')]: 'Happiness Level',
            type: 'scalar',
            component: 'VisualAnalogScale',
            parameters: {
              minLabel: { en: 'Very Unhappy' },
              maxLabel: { en: 'Very Happy' },
            },
          },
          [testVariableId('satisfaction')]: {
            [testVariableId('name')]: 'Job Satisfaction',
            type: 'ordinal',
            component: 'LikertScale',
            options: [
              { label: { en: 'Very Dissatisfied' }, value: 1 },
              { label: { en: 'Dissatisfied' }, value: 2 },
              { label: { en: 'Neutral' }, value: 3 },
              { label: { en: 'Satisfied' }, value: 4 },
              { label: { en: 'Very Satisfied' }, value: 5 },
            ],
          },
          [testVariableId('isEmployed')]: {
            [testVariableId('name')]: 'Currently Employed',
            type: 'boolean',
            component: 'Toggle',
          },
          [testVariableId('acceptTerms')]: {
            [testVariableId('name')]: 'Accept Terms',
            type: 'boolean',
            component: 'Boolean',
          },
          [testVariableId('preferredContact')]: {
            [testVariableId('name')]: 'Preferred Contact Method',
            type: 'categorical',
            component: 'ToggleButtonGroup',
            placeholder: 'Select a method...',
            options: [
              { label: { en: 'Email' }, value: 'email' },
              { label: { en: 'Phone' }, value: 'phone' },
              { label: { en: 'SMS' }, value: 'sms' },
            ],
          },
          [testVariableId('bio')]: {
            [testVariableId('name')]: 'Biography',
            type: 'text',
            component: 'TextArea',
            validation: {
              maxLength: 500,
            },
          },
          [testVariableId('nickname')]: {
            [testVariableId('name')]: 'Nickname',
            type: 'text',
            component: 'Text',
            validation: {
              unique: true,
            },
          },
          [testVariableId('password')]: {
            [testVariableId('name')]: 'Password',
            type: 'text',
            component: 'Text',
            validation: {
              required: true,
              minLength: 8,
            },
          },
          [testVariableId('confirmPassword')]: {
            [testVariableId('name')]: 'Confirm Password',
            type: 'text',
            component: 'Text',
            validation: {
              required: true,
              sameAs: testVariableId('password'),
            },
          },
          [testVariableId('startAge')]: {
            [testVariableId('name')]: 'Start Age',
            type: 'number',
            component: 'Number',
            validation: {
              required: true,
            },
          },
          [testVariableId('endAge')]: {
            [testVariableId('name')]: 'End Age',
            type: 'number',
            component: 'Number',
            validation: {
              required: true,
              greaterThanVariable: testVariableId('startAge'),
            },
          },
          [testVariableId('alternateEmail')]: {
            [testVariableId('name')]: 'Alternate Email',
            type: 'text',
            component: 'Text',
            validation: {
              differentFrom: testVariableId('email'),
            },
          },
        },
      },
    },
  },
  stages: [
    {
      type: 'NameGenerator',
      label: { en: 'Name Generator' },
      subject: {
        entity: 'node',
        types: [PERSON],
      },
    },
  ],
};

// Create mock Redux store
const createMockStore = () => {
  const mockProtocolState = {
    id: 'test-protocol-id',
    codebook: mockProtocol.codebook,
    stages: mockProtocol.stages,
    assets: [],
  };

  const mockSessionState = {
    id: 'test-session',
    currentStep: 0,
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: {
      nodes: [
        // Existing nodes for testing unique validation
        {
          _uid: 'existing-node-1',
          type: PERSON,
          [entityAttributesProperty]: {
            [testVariableId('name')]: 'John',
            [testVariableId('nickname')]: 'Johnny',
            [testVariableId('email')]: 'john@example.com',
          },
        },
        {
          _uid: 'existing-node-2',
          type: PERSON,
          [entityAttributesProperty]: {
            [testVariableId('name')]: 'Jane',
            [testVariableId('nickname')]: 'JaneD',
            [testVariableId('email')]: 'jane@example.com',
          },
        },
      ],
      edges: [],
      ego: {
        _uid: 'ego',
        [entityAttributesProperty]: {},
      },
    },
  };

  return configureStore({
    reducer: {
      session: (state: typeof mockSessionState = mockSessionState) => state,
      protocol: (state: typeof mockProtocolState = mockProtocolState) => state,
      form: (state: Record<string, unknown> = {}) => state,
      ui: (state: Record<string, unknown> = {}) => state,
    },
    preloadedState: {
      protocol: mockProtocolState,
      session: mockSessionState,
    },
  });
};

// Redux decorator for stories
const ReduxDecorator = (Story: React.ComponentType) => {
  const store = createMockStore();
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

// Demo component that uses the hook
const ProtocolFormDemo = ({
  fields,
  autoFocus = false,
  initialValues,
}: {
  fields: TForm['fields'];
  autoFocus?: boolean;
  initialValues?: Record<string, FieldValue>;
}) => {
  const { fieldComponents } = useProtocolForm({
    fields: fields.map((field) => ({ ...field, showValidationHints: true })), // Show validation hints for demo
    autoFocus,
    initialValues,
  });

  return (
    <Form
      onSubmit={async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        action('form-submitted')(data);
        return { success: true };
      }}
      className="elevation-high bg-surface w-2xl rounded p-10"
    >
      {fieldComponents}
      <SubmitButton>Submit</SubmitButton>
    </Form>
  );
};

const meta: Meta<typeof ProtocolFormDemo> = {
  title: 'Hooks/useProtocolForm',
  component: ProtocolFormDemo,
  decorators: [ReduxDecorator],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    fields: {
      control: 'object',
      description: 'Array of form field configurations from the protocol',
    },
    autoFocus: {
      control: 'boolean',
      description: 'Whether to auto-focus the first field',
    },
    initialValues: {
      control: 'object',
      description: 'Initial values for form fields',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicFields: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('email')),
        prompt: { en: 'What is your email?' },
      },
      {
        id: testId('field-3'),
        variable: asEntityAttributeReference(testVariableId('age')),
        prompt: { en: 'How old are you?' },
      },
    ],
    autoFocus: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates basic text and number input fields with validation.',
      },
    },
  },
};

export const WithAutoFocus: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('occupation')),
        prompt: { en: 'What is your occupation?' },
      },
    ],
    autoFocus: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The first field is automatically focused when autoFocus is true.',
      },
    },
  },
};

export const SelectionFields: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('gender')),
        prompt: { en: 'What is your gender?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('favoriteColors')),
        prompt: { en: 'Select your favorite colors (1-3)' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates RadioGroup (single selection) and CheckboxGroup (multiple selection) fields.',
      },
    },
  },
};

export const ToggleFields: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('isEmployed')),
        prompt: { en: 'Are you currently employed?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('acceptTerms')),
        prompt: { en: 'I accept the terms and conditions' },
      },
      {
        id: testId('field-3'),
        variable: asEntityAttributeReference(
          testVariableId('preferredContact'),
        ),
        prompt: { en: 'Preferred contact method' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates Toggle, Boolean (checkbox), and ToggleButtonGroup fields.',
      },
    },
  },
};

export const DateFields: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('birthDate')),
        prompt: { en: 'When were you born?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('startDate')),
        prompt: { en: 'When did you start your current job?' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates DatePicker (absolute dates) and RelativeDatePicker (relative dates) fields.',
      },
    },
  },
};

export const ScaleFields: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('happiness')),
        prompt: { en: 'How happy are you overall?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('satisfaction')),
        prompt: { en: 'How satisfied are you with your job?' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates VisualAnalogScale (continuous) and LikertScale (discrete) fields.',
      },
    },
  },
};

export const TextAreaField: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('bio')),
        prompt: { en: 'Tell us about yourself (max 500 characters)' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates the TextArea field for longer text input.',
      },
    },
  },
};

export const WithInitialValues: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('age')),
        prompt: { en: 'How old are you?' },
      },
      {
        id: testId('field-3'),
        variable: asEntityAttributeReference(testVariableId('gender')),
        prompt: { en: 'What is your gender?' },
      },
      {
        id: testId('field-4'),
        variable: asEntityAttributeReference(testVariableId('favoriteColors')),
        prompt: { en: 'Select your favorite colors' },
      },
      {
        id: testId('field-5'),
        variable: asEntityAttributeReference(testVariableId('isEmployed')),
        prompt: { en: 'Are you currently employed?' },
      },
      {
        id: testId('field-6'),
        variable: asEntityAttributeReference(testVariableId('bio')),
        prompt: { en: 'Tell us about yourself' },
      },
    ],
    initialValues: {
      [testVariableId('name')]: 'John Doe',
      [testVariableId('age')]: 32,
      [testVariableId('gender')]: 'male',
      [testVariableId('favoriteColors')]: ['blue', 'green'],
      [testVariableId('isEmployed')]: true,
      [testVariableId('bio')]:
        'A software developer passionate about building great user experiences.',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates how to pre-populate form fields with initial values. This is useful when editing existing data.',
      },
    },
  },
};

export const ComprehensiveForm: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('email')),
        prompt: { en: 'What is your email?' },
      },
      {
        id: testId('field-3'),
        variable: asEntityAttributeReference(testVariableId('age')),
        prompt: { en: 'How old are you?' },
      },
      {
        id: testId('field-4'),
        variable: asEntityAttributeReference(testVariableId('gender')),
        prompt: { en: 'What is your gender?' },
      },
      {
        id: testId('field-5'),
        variable: asEntityAttributeReference(testVariableId('occupation')),
        prompt: { en: 'What is your occupation?' },
      },
      {
        id: testId('field-6'),
        variable: asEntityAttributeReference(testVariableId('isEmployed')),
        prompt: { en: 'Are you currently employed?' },
      },
      {
        id: testId('field-7'),
        variable: asEntityAttributeReference(testVariableId('satisfaction')),
        prompt: { en: 'How satisfied are you with your job?' },
      },
      {
        id: testId('field-8'),
        variable: asEntityAttributeReference(testVariableId('favoriteColors')),
        prompt: { en: 'What are your favorite colors? (Select 1-3)' },
      },
      {
        id: testId('field-9'),
        variable: asEntityAttributeReference(
          testVariableId('preferredContact'),
        ),
        prompt: { en: 'How should we contact you?' },
      },
      {
        id: testId('field-10'),
        variable: asEntityAttributeReference(testVariableId('bio')),
        prompt: { en: 'Tell us about yourself' },
      },
    ],
    autoFocus: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A comprehensive form demonstrating all available field types processed by useProtocolForm.',
      },
    },
  },
};

export const MinimalForm: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'A minimal form with just a single field.',
      },
    },
  },
};

export const UniqueValidation: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('nickname')),
        prompt: {
          en: 'Enter a unique nickname (try "Johnny" or "JaneD" to see validation error)',
        },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the unique validation. The nickname must be unique among all existing nodes. Try entering "Johnny" or "JaneD" to see the validation error.',
      },
    },
  },
};

export const SameAsValidation: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('password')),
        prompt: { en: 'Enter your password' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('confirmPassword')),
        prompt: { en: 'Confirm your password' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the sameAs validation. The confirm password field must match the password field.',
      },
    },
  },
};

export const DifferentFromValidation: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('email')),
        prompt: { en: 'Enter your primary email' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('alternateEmail')),
        prompt: {
          en: 'Enter an alternate email (must be different from primary)',
        },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the differentFrom validation. The alternate email must be different from the primary email.',
      },
    },
  },
};

export const GreaterThanVariableValidation: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('startAge')),
        prompt: { en: 'Enter start age' },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('endAge')),
        prompt: { en: 'Enter end age (must be greater than start age)' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the greaterThanVariable validation. The end age must be greater than the start age.',
      },
    },
  },
};

export const ContextDependentValidations: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('nickname')),
        prompt: {
          en: 'Enter a unique nickname (try "Johnny" or "JaneD" to see validation error)',
        },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('password')),
        prompt: { en: 'Enter your password' },
      },
      {
        id: testId('field-3'),
        variable: asEntityAttributeReference(testVariableId('confirmPassword')),
        prompt: { en: 'Confirm your password (must match password)' },
      },
      {
        id: testId('field-4'),
        variable: asEntityAttributeReference(testVariableId('email')),
        prompt: { en: 'Enter your primary email' },
      },
      {
        id: testId('field-5'),
        variable: asEntityAttributeReference(testVariableId('alternateEmail')),
        prompt: {
          en: 'Enter an alternate email (must be different from primary)',
        },
      },
      {
        id: testId('field-6'),
        variable: asEntityAttributeReference(testVariableId('startAge')),
        prompt: { en: 'Enter start age' },
      },
      {
        id: testId('field-7'),
        variable: asEntityAttributeReference(testVariableId('endAge')),
        prompt: { en: 'Enter end age (must be greater than start age)' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'A comprehensive example demonstrating all context-dependent validations: unique, sameAs, differentFrom, and greaterThanVariable.',
      },
    },
  },
};

export const HintText: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
        hint: {
          en: 'Enter your full legal name as it appears on official documents.',
        },
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('email')),
        prompt: { en: 'What is your email?' },
        hint: { en: 'We will use this to send you a confirmation.' },
      },
      {
        id: testId('field-3'),
        variable: asEntityAttributeReference(testVariableId('age')),
        prompt: { en: 'How old are you?' },
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the `hint` property on protocol fields. Hints provide supplementary guidance below the field label.',
      },
    },
  },
};

export const ValidationHints: Story = {
  args: {
    fields: [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(testVariableId('name')),
        prompt: { en: 'What is your name?' },
        hint: { en: 'Enter your full legal name.' },
        showValidationHints: true,
      },
      {
        id: testId('field-2'),
        variable: asEntityAttributeReference(testVariableId('email')),
        prompt: { en: 'What is your email?' },
        showValidationHints: true,
      },
      {
        id: testId('field-3'),
        variable: asEntityAttributeReference(testVariableId('age')),
        prompt: { en: 'How old are you?' },
        showValidationHints: true,
      },
      {
        id: testId('field-4'),
        variable: asEntityAttributeReference(testVariableId('favoriteColors')),
        prompt: { en: 'Select your favorite colors' },
        hint: { en: 'Pick the colors you like most.' },
        showValidationHints: true,
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates `showValidationHints` combined with `hint`. When enabled, a human-readable summary of validation rules (e.g. "required", "between 2 and 100 characters") is displayed below the hint text.',
      },
    },
  },
};
