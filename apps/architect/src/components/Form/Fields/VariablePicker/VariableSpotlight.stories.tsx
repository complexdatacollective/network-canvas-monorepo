import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { fn, screen, userEvent } from 'storybook/test';

import VariableSpotlight from './VariableSpotlight';

type StoryArgs = ComponentProps<typeof VariableSpotlight>;

const VARIABLE_OPTIONS: StoryArgs['options'] = [
  {
    value: 'participant-age',
    label: 'participant_age',
    type: 'number',
  },
  {
    value: 'consent-given',
    label: 'consent_given',
    type: 'boolean',
  },
  {
    value: 'preferred-contact-method',
    label: 'preferred_contact_method',
    type: 'categorical',
  },
  {
    value: 'neighbourhood-connection-frequency',
    label: 'participant_neighbourhood_connection_frequency',
    type: 'ordinal',
  },
];

const createStoryStore = () =>
  createStore(() => ({
    activeProtocol: {
      present: {
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
      },
    },
  }));

const meta = {
  title: 'Components/Form/VariableSpotlight',
  component: VariableSpotlight,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <Provider store={createStoryStore()}>
        <Story />
      </Provider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
\`VariableSpotlight\` is Architect's focused modal for applying an attribute to a
configuration slot. It lets protocol authors search existing attributes and,
when the context permits, create a new attribute without leaving their current
task.

\`\`\`tsx
<VariableSpotlight
  open={showPicker}
  onOpenChange={setShowPicker}
  entity="node"
  type={nodeType}
  options={variableOptions}
  disallowCreation={false}
  onSelect={(uuid) => {
    applyVariable(uuid);
    setShowPicker(false);
  }}
  onCreateOption={(name) => {
    createAndApplyVariable(name);
    setShowPicker(false);
  }}
  onCancel={() => setShowPicker(false)}
/>
\`\`\`

- \`open\` and \`onOpenChange\` make the modal controlled by its caller.
- \`options\` supplies the attributes that can be selected. Results are sorted
  and filtered by their labels.
- \`entity\` and \`type\` identify the codebook subject used to validate a new
  name against existing attributes.
- \`disallowCreation\` limits the spotlight to existing attributes while keeping
  search and selection available.
- \`onSelect\`, \`onCreateOption\`, and \`onCancel\` let the caller own the
  resulting workflow and state changes.
`,
      },
    },
  },
  args: {
    open: true,
    entity: 'node',
    type: 'person',
    options: VARIABLE_OPTIONS,
    disallowCreation: false,
    onOpenChange: fn().mockName('open-changed'),
    onSelect: fn().mockName('variable-selected'),
    onCreateOption: fn().mockName('variable-created'),
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the controlled spotlight modal is open.',
    },
    entity: {
      control: 'select',
      options: ['node', 'edge', 'ego'],
      description:
        'Codebook entity used to scope new-attribute name validation.',
    },
    type: {
      control: 'text',
      description:
        'Optional node or edge type used to scope name validation further.',
    },
    options: {
      control: 'object',
      description: 'Existing attributes available for search and selection.',
    },
    disallowCreation: {
      control: 'boolean',
      description:
        'Prevents creating a new attribute while retaining search and selection.',
    },
    onOpenChange: {
      control: false,
      description: 'Called when the modal requests an open-state change.',
      table: { category: 'Events' },
    },
    onSelect: {
      control: false,
      description: 'Called with the selected attribute UUID.',
      table: { category: 'Events' },
    },
    onCreateOption: {
      control: false,
      description: 'Called with the validated name of a new attribute.',
      table: { category: 'Events' },
    },
  },
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectOrCreate: Story = {};

export const CreateNewVariable: Story = {
  play: async () => {
    const input = await screen.findByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    await userEvent.type(input, 'follow_up_notes');
  },
  parameters: {
    docs: {
      description: {
        story:
          'A new, valid name appears as a creation option above any matching existing attributes.',
      },
    },
  },
};

export const InvalidVariableName: Story = {
  play: async () => {
    const input = await screen.findByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    await userEvent.type(input, 'follow up notes');
  },
  parameters: {
    docs: {
      description: {
        story:
          'Invalid names remain visible as disabled results with the validation reason.',
      },
    },
  },
};

export const SelectExistingOnly: Story = {
  args: {
    disallowCreation: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Use selection-only mode when the surrounding workflow cannot create attributes.',
      },
    },
  },
};

export const NoVariablesYet: Story = {
  args: {
    options: [],
  },
  parameters: {
    docs: {
      description: {
        story:
          'When creation is available, the empty state explains how to create the first attribute.',
      },
    },
  },
};

export const NoSelectableVariables: Story = {
  args: {
    disallowCreation: true,
    options: [],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Selection-only mode explains that attributes must be created elsewhere when none exist.',
      },
    },
  },
};
