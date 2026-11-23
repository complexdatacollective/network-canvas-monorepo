import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { icons } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { fn } from 'storybook/test';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import {
  asEntityAttributeReference,
  type Form as TForm,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';
import NodeForm from './NodeForm';

const PERSON_TYPE = testTypeId('person');
const V = {
  name: testVariableId('name'),
  age: testVariableId('age'),
  gender: testVariableId('gender'),
  occupation: testVariableId('occupation'),
  favoriteColors: testVariableId('favoriteColors'),
  birthDate: testVariableId('birthDate'),
  happiness: testVariableId('happiness'),
  isEmployed: testVariableId('isEmployed'),
  bio: testVariableId('bio'),
  skills: testVariableId('skills'),
  communicationPreference: testVariableId('communicationPreference'),
};

const customIconOptions = ['add-a-person', 'add-a-place'];

const iconOptions = [...customIconOptions, ...Object.keys(icons)];

type StoryArgs = ComponentProps<typeof NodeForm> & { icon: string };

// Mock data for the story
const buildMockProtocol = (icon: string) => ({
  name: 'Test Protocol',
  codebook: {
    node: {
      [PERSON_TYPE]: {
        name: 'Person',
        displayVariable: V.name,
        icon,
        variables: {
          [V.name]: {
            name: 'Name',
            type: 'text',
            component: 'Text',
            validation: {
              required: true,
              minLength: 2,
              maxLength: 100,
            },
          },
          [V.age]: {
            name: 'Age',
            type: 'number',
            component: 'Number',
            validation: {
              minValue: 18,
              maxValue: 60,
            },
          },
          [V.gender]: {
            name: 'Gender',
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
          [V.occupation]: {
            name: 'Occupation',
            type: 'text',
            component: 'Text',
          },
          [V.favoriteColors]: {
            name: 'Favorite Colors',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: { en: 'Red' }, value: 'red' },
              { label: { en: 'Blue' }, value: 'blue' },
              { label: { en: 'Green' }, value: 'green' },
              { label: { en: 'Yellow' }, value: 'yellow' },
              { label: { en: 'Purple' }, value: 'purple' },
            ],
            validation: {
              required: true,
              minSelected: 2,
              maxSelected: 3,
            },
          },
          [V.birthDate]: {
            name: 'Birth Date',
            type: 'datetime',
            component: 'DatePicker',
          },
          [V.happiness]: {
            name: 'Happiness Level',
            type: 'scalar',
            component: 'Slider',
            parameters: {
              min: 0,
              max: 100,
            },
          },
          [V.isEmployed]: {
            name: 'Currently Employed',
            type: 'boolean',
            component: 'Toggle',
          },
          [V.bio]: {
            name: 'Biography',
            type: 'text',
            component: 'TextArea',
            validation: {
              maxLength: 500,
            },
          },
          [V.skills]: {
            name: 'Skills',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: { en: 'JavaScript' }, value: 'javascript' },
              { label: { en: 'Python' }, value: 'python' },
              { label: { en: 'Java' }, value: 'java' },
              { label: { en: 'C++' }, value: 'cpp' },
              { label: { en: 'Ruby' }, value: 'ruby' },
              { label: { en: 'Go' }, value: 'go' },
            ],
            validation: {
              required: true,
              minSelected: 1,
              maxSelected: 4,
            },
          },
          [V.communicationPreference]: {
            name: 'Communication Preference',
            type: 'categorical',
            component: 'ToggleButtonGroup',
            options: [
              { label: { en: 'Email' }, value: 'email' },
              { label: { en: 'Phone' }, value: 'phone' },
              { label: { en: 'Text' }, value: 'text' },
              { label: { en: 'Video Call' }, value: 'video' },
            ],
            validation: {
              required: true,
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
        type: PERSON_TYPE,
      },
      prompts: [
        {
          id: 'prompt-1',
          text: { en: 'Name the people in your network' },
        },
      ],
      form: {
        title: { en: 'Add Person Details' },
        fields: [
          {
            id: 'field-1',
            variable: asEntityAttributeReference(V.name),
            prompt: { en: "What is this person's name?" },
          },
          {
            id: 'field-2',
            variable: asEntityAttributeReference(V.age),
            prompt: { en: 'How old is this person?' },
          },
          {
            id: 'field-3',
            variable: asEntityAttributeReference(V.gender),
            prompt: { en: 'What is their gender?' },
          },
          {
            id: 'field-4',
            variable: asEntityAttributeReference(V.occupation),
            prompt: { en: 'What is their occupation?' },
          },
          {
            id: 'field-5',
            variable: asEntityAttributeReference(V.favoriteColors),
            prompt: { en: 'What are their favorite colors?' },
          },
          {
            id: 'field-6',
            variable: asEntityAttributeReference(V.birthDate),
            prompt: { en: 'When were they born?' },
          },
          {
            id: 'field-7',
            variable: asEntityAttributeReference(V.happiness),
            prompt: { en: 'How happy are they generally?' },
          },
          {
            id: 'field-8',
            variable: asEntityAttributeReference(V.isEmployed),
            prompt: { en: 'Are they currently employed?' },
          },
          {
            id: 'field-9',
            variable: asEntityAttributeReference(V.bio),
            prompt: { en: 'Tell us a bit about them' },
          },
        ],
      },
    },
  ],
});

// Create a proper mock session that matches the expected structure
const mockSession = {
  id: 'test-session',
  currentStep: 0,
  startTime: new Date().toISOString(),
  finishTime: null,
  exportTime: null,
  lastUpdated: new Date().toISOString(),
  network: {
    nodes: [
      {
        [entityPrimaryKeyProperty]: 'node-1',
        type: PERSON_TYPE,
        [entityAttributesProperty]: {
          [V.name]: 'Alice Smith',
          [V.age]: 28,
          [V.gender]: 'female',
          [V.occupation]: 'Software Engineer',
          [V.isEmployed]: true,
        },
      },
      {
        [entityPrimaryKeyProperty]: 'node-2',
        type: PERSON_TYPE,
        [entityAttributesProperty]: {
          [V.name]: 'Bob Johnson',
          [V.age]: 35,
          [V.gender]: 'male',
          [V.occupation]: 'Product Manager',
          [V.isEmployed]: true,
        },
      },
    ],
    edges: [],
    ego: {
      [entityAttributesProperty]: {},
    },
  },
};

// Create mock Redux store with proper structure
const createMockStore = (
  icon: string,
  overrides: Record<string, unknown> = {},
) => {
  const mockProtocol = buildMockProtocol(icon);
  const mockProtocolState = {
    id: 'test-protocol-id',
    codebook: mockProtocol.codebook,
    stages: mockProtocol.stages, // This MUST be an array for the getStages selector
    assets: [], // Ensure assets is an array
  };

  const mockSessionState = {
    ...mockSession,
    // Add stage info that getStageSubject selector expects
    currentStep: 0, // This maps to first stage
  };

  return configureStore({
    reducer: {
      session: (state: unknown = mockSessionState): unknown => state,
      protocol: (state: unknown = mockProtocolState): unknown => state,
      form: (state: unknown = {}): unknown => state,
      ui: (state: unknown = {}): unknown => state,
    },
    preloadedState: {
      protocol: mockProtocolState,
      session: mockSessionState,
      ...overrides,
    },
  });
};

// Story decorator to provide Redux store
const ReduxDecorator = (
  Story: React.ComponentType,
  context: {
    args: { icon?: string };
    parameters?: { reduxState?: unknown };
  },
) => {
  const store = createMockStore(
    context.args.icon ?? 'add-a-person',
    context.parameters?.reduxState as Record<string, unknown> | undefined,
  );
  return (
    <Provider store={store}>
      <div className="relative flex h-screen w-screen items-end justify-end p-6">
        <Story />
      </div>
    </Provider>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/NameGenerator/NodeForm',
  component: NodeForm,
  decorators: [ReduxDecorator],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    icon: 'add-a-person',
    addNode: fn(async (): Promise<FormSubmissionResult> => ({ success: true })),
  },
  argTypes: {
    icon: {
      control: 'select',
      options: iconOptions,
      description:
        'Icon for the node type (story-only — drives the redux codebook mock).',
    },
    selectedNode: {
      control: 'object',
      description: 'The node being edited, or null for creating a new node',
    },
    form: {
      control: 'object',
      description: 'Form configuration from the protocol',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the form is disabled',
    },
    onClose: {
      action: 'closed',
      description: 'Callback when form is closed',
    },
    addNode: {
      description:
        'Saves a new node, resolving to the outcome the form reports to the participant',
    },
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

// Basic form with all field types
const basicForm: TForm = {
  title: { en: 'Add Person to Your Network' },
  fields: [
    {
      id: testId('field-1'),
      variable: asEntityAttributeReference(V.name),
      prompt: { en: 'What is their name?' },
    },
    {
      id: testId('field-2'),
      variable: asEntityAttributeReference(V.age),
      prompt: { en: 'How old are they?' },
    },
    {
      id: testId('field-3'),
      variable: asEntityAttributeReference(V.gender),
      prompt: { en: 'What is their gender?' },
    },
    {
      id: testId('field-4'),
      variable: asEntityAttributeReference(V.occupation),
      prompt: { en: 'What do they do for work?' },
    },
  ],
};

// Form with validation
const validatedForm: TForm = {
  title: { en: 'Add Person (with validation)' },
  fields: [
    {
      id: testId('field-1'),
      variable: asEntityAttributeReference(V.name),
      prompt: { en: 'Name (required)' },
    },
    {
      id: testId('field-2'),
      variable: asEntityAttributeReference(V.age),
      prompt: { en: 'Age (18-100)' },
    },
    {
      id: testId('field-3'),
      variable: asEntityAttributeReference(V.favoriteColors),
      prompt: { en: 'Select at least 2 favorite colors' },
    },
  ],
};

export const CreateNewNode: Story = {
  args: {
    selectedNode: null,
    form: basicForm,
    disabled: false,
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export const CreateNewNodeWithLucideIcon: Story = {
  args: {
    selectedNode: null,
    form: basicForm,
    disabled: false,
    icon: 'Smartphone',
  },
  render: ({ icon: _icon, ...args }) => <NodeForm {...args} />,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Create-new-node button whose node type uses a Lucide icon (`Smartphone`) instead of a custom kebab-case icon. Verifies the icon stays vertically centred inside the toggle circle.',
      },
    },
  },
};

export const EditExistingNode: Story = {
  args: {
    selectedNode: {
      [entityPrimaryKeyProperty]: 'node-1',
      type: PERSON_TYPE,
      [entityAttributesProperty]: {
        [V.name]: 'Alice Smith',
        [V.age]: 28,
        [V.gender]: 'female',
        [V.occupation]: 'Software Engineer',
      },
    },
    form: basicForm,
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "This story demonstrates the initialValues feature. When editing an existing node, the form fields are pre-populated with the node's current attribute values. The form uses the `initialValues` parameter passed to `useProtocolForm` to set the initial field values.",
      },
    },
  },
};

export const WithValidation: Story = {
  args: {
    selectedNode: null,
    form: validatedForm,
    disabled: false,
  },
};

export const DisabledState: Story = {
  args: {
    selectedNode: null,
    form: basicForm,
    disabled: true,
  },
};

export const EmptyForm: Story = {
  args: {
    selectedNode: null,
    form: {
      title: { en: 'Quick Add' },
      fields: [],
    },
    disabled: false,
  },
};

export const SingleFieldForm: Story = {
  args: {
    selectedNode: null,
    form: {
      title: { en: 'Add Name Only' },
      fields: [
        {
          id: testId('field-1'),
          variable: asEntityAttributeReference(V.name),
          prompt: { en: "Enter the person's name" },
        },
      ],
    },
    disabled: false,
  },
};

// Form with multiple field types to demonstrate initialValues comprehensively
const comprehensiveForm: TForm = {
  title: { en: 'Complete Profile' },
  fields: [
    {
      id: testId('field-1'),
      variable: asEntityAttributeReference(V.name),
      prompt: { en: 'What is their name?' },
    },
    {
      id: testId('field-2'),
      variable: asEntityAttributeReference(V.age),
      prompt: { en: 'How old are they?' },
    },
    {
      id: testId('field-3'),
      variable: asEntityAttributeReference(V.gender),
      prompt: { en: 'What is their gender?' },
    },
    {
      id: testId('field-4'),
      variable: asEntityAttributeReference(V.occupation),
      prompt: { en: 'What do they do for work?' },
    },
    {
      id: testId('field-5'),
      variable: asEntityAttributeReference(V.favoriteColors),
      prompt: { en: 'What are their favorite colors?' },
    },
    {
      id: testId('field-6'),
      variable: asEntityAttributeReference(V.isEmployed),
      prompt: { en: 'Are they currently employed?' },
    },
    {
      id: testId('field-7'),
      variable: asEntityAttributeReference(V.bio),
      prompt: { en: 'Tell us a bit about them' },
    },
  ],
};

export const EditWithMultipleFieldTypes: Story = {
  args: {
    selectedNode: {
      [entityPrimaryKeyProperty]: 'node-3',
      type: PERSON_TYPE,
      [entityAttributesProperty]: {
        [V.name]: 'Jordan Lee',
        [V.age]: 32,
        [V.gender]: 'non_binary',
        [V.occupation]: 'UX Designer',
        [V.favoriteColors]: ['blue', 'purple'],
        [V.isEmployed]: true,
        [V.bio]:
          'A creative professional passionate about user experience and accessibility.',
      },
    },
    form: comprehensiveForm,
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'This story demonstrates initialValues with multiple field types including text, number, radio group, checkbox group, toggle, and textarea. All fields are pre-populated with the existing node data, showing how the form system handles different data types for initial values.',
      },
    },
  },
};

// Story with custom initial network for testing unique validation
export const WithUniqueValidation: Story = {
  args: {
    selectedNode: null,
    form: {
      title: { en: 'Add Unique Person' },
      fields: [
        {
          id: testId('field-1'),
          variable: asEntityAttributeReference(V.name),
          prompt: {
            en: 'Enter a unique name (Alice Smith and Bob Johnson already exist)',
          },
        },
      ],
    },
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'This story demonstrates unique validation. Try entering "Alice Smith" or "Bob Johnson" to see the validation error.',
      },
    },
  },
};

// CheckboxGroup with validation
const checkboxGroupForm: TForm = {
  title: { en: 'Select Your Skills' },
  fields: [
    {
      id: testId('field-1'),
      variable: asEntityAttributeReference(V.name),
      prompt: { en: 'Your name' },
    },
    {
      id: testId('field-2'),
      variable: asEntityAttributeReference(V.skills),
      prompt: { en: 'Select your programming skills (1-4 required)' },
    },
  ],
};

export const CheckboxGroupWithValidation: Story = {
  args: {
    selectedNode: null,
    form: checkboxGroupForm,
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'This story demonstrates a CheckboxGroup component with validation. The skills field requires at least 1 selection and allows a maximum of 4 selections. Try submitting without selecting any options, or with more than 4 options to see validation errors.',
      },
    },
  },
};

export const CheckboxGroupWithInitialValues: Story = {
  args: {
    selectedNode: {
      [entityPrimaryKeyProperty]: 'node-4',
      type: PERSON_TYPE,
      [entityAttributesProperty]: {
        [V.name]: 'Sarah Developer',
        [V.skills]: ['javascript', 'python', 'java'],
      },
    },
    form: checkboxGroupForm,
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'This story shows a CheckboxGroup with pre-selected values. The form is pre-populated with JavaScript, Python, and Java skills.',
      },
    },
  },
};

// ToggleButtonGroup with validation
const toggleButtonGroupForm: TForm = {
  title: { en: 'Communication Preferences' },
  fields: [
    {
      id: testId('field-1'),
      variable: asEntityAttributeReference(V.name),
      prompt: { en: 'Your name' },
    },
    {
      id: testId('field-2'),
      variable: asEntityAttributeReference(V.communicationPreference),
      prompt: { en: 'How would you prefer to be contacted?' },
    },
  ],
};

export const ToggleButtonGroupWithValidation: Story = {
  args: {
    selectedNode: null,
    form: toggleButtonGroupForm,
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'This story demonstrates a ToggleButtonGroup component with required validation. You must select one communication preference option. Try submitting without selecting an option to see the validation error.',
      },
    },
  },
};

export const ToggleButtonGroupWithInitialValue: Story = {
  args: {
    selectedNode: {
      [entityPrimaryKeyProperty]: 'node-5',
      type: PERSON_TYPE,
      [entityAttributesProperty]: {
        [V.name]: 'Mike Contact',
        [V.communicationPreference]: 'email',
      },
    },
    form: toggleButtonGroupForm,
    disabled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'This story shows a ToggleButtonGroup with a pre-selected value. The form is pre-populated with "Email" as the selected communication preference.',
      },
    },
  },
};
