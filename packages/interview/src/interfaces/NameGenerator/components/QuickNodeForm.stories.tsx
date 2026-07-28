import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Provider } from 'react-redux';

import type { NodeDefinition } from '@codaco/protocol-validation';
import {
  type EntityAttributesProperty,
  entityAttributesProperty,
  type NcNode,
} from '@codaco/shared-consts';

import QuickNodeForm from './QuickNodeForm';

// `component` is required on the "name" variable: QuickNodeForm resolves the
// quickAdd target's validation props through the same codebook-variable
// metadata lookup a Field uses, which needs `component` present on the
// variable (there is no stage-level form field here to supply one instead).
// `validation` is omitted so the field is a genuinely optional writer
// (no-fallback design) — see WithRequiredVariable below for the codebook
// `required` case.
const mockProtocol = {
  id: 'test-protocol',
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        icon: 'add-a-person',
        variables: {
          name: {
            name: 'Name',
            type: 'text',
            component: 'Text',
          },
        },
      } satisfies NodeDefinition,
    },
  },
  stages: [
    {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name Generator',
      subject: {
        entity: 'node',
        type: 'person',
      },
      prompts: [
        {
          id: 'prompt-1',
          text: 'Name the people in your network',
          additionalAttributes: [{ variable: 'closeness', value: 5 }],
        },
      ],
    },
  ],
  experiments: {
    encryptedVariables: false,
  },
  assets: [],
};

// A variant of the protocol whose "name" variable carries a codebook
// `required` rule, demonstrating that QuickNodeForm derives validation from
// the codebook rather than a hard-coded default.
const mockProtocolWithRequiredVariable = {
  ...mockProtocol,
  codebook: {
    node: {
      person: {
        ...mockProtocol.codebook.node.person,
        variables: {
          name: {
            name: 'Name',
            type: 'text',
            component: 'Text',
            validation: { required: true },
          },
        },
      } satisfies NodeDefinition,
    },
  },
};

const mockSession = {
  id: 'test-session',
  currentStep: 0,
  promptIndex: 0,
  network: {
    nodes: [],
    edges: [],
    ego: {
      [entityAttributesProperty]: {},
    },
  },
};

const createMockStore = (protocol: typeof mockProtocol = mockProtocol) => {
  const mockProtocolState = {
    id: 'test-protocol-id',
    codebook: protocol.codebook,
    stages: protocol.stages,
    assets: [],
    experiments: {
      encryptedVariables: false,
    },
  };

  const mockSessionState = {
    ...mockSession,
    currentStep: 0,
  };

  const mockUiState = {
    passphrase: null as string | null,
    passphraseInvalid: false,
    showPassphrasePrompter: false,
  };

  return configureStore({
    reducer: {
      session: (state: unknown = mockSessionState): unknown => state,
      protocol: (state: unknown = mockProtocolState): unknown => state,
      form: (state: unknown = {}): unknown => state,
      ui: (state: unknown = mockUiState): unknown => state,
    },
    preloadedState: {
      protocol: mockProtocolState,
      session: mockSessionState,
      ui: mockUiState,
    },
  });
};

type StoryArgs = React.ComponentProps<typeof QuickNodeForm> & {
  /** Story-only: switches the mock codebook's "name" variable between
   * rule-less and a codebook `required` rule, demonstrating that
   * QuickNodeForm derives validation from the codebook rather than a
   * hard-coded default. */
  requiredVariable?: boolean;
};

const ReduxDecorator = (
  Story: React.ComponentType,
  context: { args: { requiredVariable?: boolean } },
) => {
  const store = createMockStore(
    context.args.requiredVariable
      ? mockProtocolWithRequiredVariable
      : mockProtocol,
  );
  return (
    <Provider store={store}>
      <div className="relative flex h-[400px] w-[800px] items-end justify-end p-6">
        <Story />
      </div>
    </Provider>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/NameGenerator/QuickNodeForm',
  component: QuickNodeForm,
  decorators: [ReduxDecorator],
  parameters: {
    layout: 'centered',
  },
  args: {
    requiredVariable: false,
  },
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'Whether the form is disabled',
    },
    targetVariable: {
      control: 'text',
      description: 'The variable name for the quick add field',
    },
    onShowForm: {
      action: 'form-shown',
      description: 'Callback when the form is shown',
    },
    addNode: {
      action: 'node-added',
      description: 'Callback when a node is added',
    },
    requiredVariable: {
      control: 'boolean',
      description:
        'Give the target variable a codebook `required` rule (story-only — drives which mock codebook is used).',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function QuickNodeFormWrapper(
  props: Omit<React.ComponentProps<typeof QuickNodeForm>, 'addNode'> & {
    addNode?: (attributes: NcNode[EntityAttributesProperty]) => Promise<void>;
  },
) {
  const [addedNodes, setAddedNodes] = useState<
    NcNode[EntityAttributesProperty][]
  >([]);
  const [formShown, setFormShown] = useState(false);

  const handleAddNode = async (
    attributes: NcNode[EntityAttributesProperty],
  ) => {
    setAddedNodes((prev) => [...prev, attributes]);
    await props.addNode?.(attributes);
  };

  const handleShowForm = () => {
    setFormShown(true);
    props.onShowForm?.();
  };

  return (
    <div className="flex flex-col items-end gap-4">
      <QuickNodeForm
        {...props}
        addNode={handleAddNode}
        onShowForm={handleShowForm}
      />
      {formShown && (
        <div className="text-xs text-current/70" data-testid="form-shown">
          Form revealed
        </div>
      )}
      {addedNodes.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="added-nodes">
          <div className="text-sm font-medium text-white">Added nodes:</div>
          {addedNodes.map((node, index) => (
            <div
              key={index}
              className="bg-surface-1 text-surface-1-contrast rounded px-3 py-2 text-sm"
              data-testid={`added-node-${index}`}
            >
              {JSON.stringify(node)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const Default: Story = {
  args: {
    disabled: false,
    targetVariable: 'name',
  },
  render: ({ requiredVariable: _requiredVariable, ...args }) => (
    <QuickNodeFormWrapper {...args} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The QuickNodeForm provides a quick way to add nodes with a single field. Click the button to reveal the input, type a name, and press Enter to add.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    targetVariable: 'name',
  },
  render: ({ requiredVariable: _requiredVariable, ...args }) => (
    <QuickNodeFormWrapper {...args} />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Disabled state prevents interaction with the form.',
      },
    },
  },
};

export const AddNodeFlow: Story = {
  args: {
    disabled: false,
    targetVariable: 'name',
  },
  render: ({ requiredVariable: _requiredVariable, ...args }) => (
    <QuickNodeFormWrapper {...args} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The complete flow of adding a node: click to reveal, type a name, and submit.',
      },
    },
  },
};

export const DisabledState: Story = {
  args: {
    disabled: true,
    targetVariable: 'name',
  },
  render: ({ requiredVariable: _requiredVariable, ...args }) => (
    <QuickNodeFormWrapper {...args} />
  ),
  parameters: {
    docs: {
      description: {
        story: 'The disabled state prevents form interaction.',
      },
    },
  },
};

export const WithCodebookRequiredVariable: Story = {
  args: {
    disabled: false,
    targetVariable: 'name',
    requiredVariable: true,
  },
  render: ({ requiredVariable: _requiredVariable, ...args }) => (
    <QuickNodeFormWrapper {...args} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Validation is derived from the codebook, not hard-coded: this mock protocol gives the quickAdd target variable a `required` rule, so pressing Enter with nothing typed is rejected. Toggle `requiredVariable` off (the other stories' default) to see the no-fallback behaviour — a rule-less variable accepts an empty submission and creates the node.",
      },
    },
  },
};
