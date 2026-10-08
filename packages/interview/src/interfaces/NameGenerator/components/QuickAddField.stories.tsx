import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { icons } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import type { NodeDefinition } from '@codaco/protocol-validation';

import { writeSubmissionResult } from '../../../forms/writeSubmissionResult';
import { runtimeMessages } from '../../../i18n/runtimeMessages';
import QuickAddField from './QuickAddField';

const customIconOptions = ['add-a-person', 'add-a-place'];

const iconOptions = [...customIconOptions, ...Object.keys(icons)];

type StoryArgs = Omit<ComponentProps<typeof QuickAddField>, 'onAdd'> & {
  icon: string;
  maxNodes: number;
};

const buildMockProtocol = (icon: string, maxNodes: number) => ({
  id: 'test-protocol',
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        icon,
        variables: {
          name: {
            name: 'Name',
            type: 'text',
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
      ...(maxNodes > 0 ? { behaviours: { maxNodes } } : {}),
      prompts: [
        {
          id: 'prompt-1',
          text: 'Name the people in your network',
        },
      ],
    },
  ],
  experiments: {
    encryptedVariables: false,
  },
  assets: [],
});

const mockSession = {
  id: 'test-session',
  currentStep: 0,
  promptIndex: 0,
  network: {
    nodes: [],
    edges: [],
    ego: {
      _attributes: {},
    },
  },
};

const createMockStore = (icon: string, maxNodes: number) => {
  const mockProtocol = buildMockProtocol(icon, maxNodes);

  const mockProtocolState = {
    id: 'test-protocol-id',
    codebook: mockProtocol.codebook,
    stages: mockProtocol.stages,
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

const ReduxDecorator = (
  Story: React.ComponentType,
  context: { args: { icon?: string; maxNodes?: number } },
) => {
  const store = createMockStore(
    context.args.icon ?? 'add-a-person',
    context.args.maxNodes ?? 0,
  );
  return (
    <Provider store={store}>
      <div className="bg-background relative flex h-[400px] w-[700px] items-end justify-end p-6">
        <Story />
      </div>
    </Provider>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/NameGenerator/QuickAddField',
  decorators: [ReduxDecorator],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    icon: 'add-a-person',
    maxNodes: 0,
  },
  argTypes: {
    icon: {
      control: 'select',
      options: iconOptions,
      description:
        'Icon for the node type (story-only — drives the redux codebook mock).',
    },
    name: {
      control: 'text',
      description: 'Field name (variable)',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text for the input',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the field is disabled',
    },
    maxNodes: {
      control: 'number',
      description:
        "The stage's `maxNodes` allowance (story-only — drives the redux stage mock; 0 means unlimited). The usage hint only promises that the box stays open while more than one node can still be added.",
    },
    onShowInput: {
      action: 'input-shown',
      description: 'Callback when the input is revealed',
    },
    required: {
      control: 'boolean',
      description: 'Whether the field is required',
    },
    minLength: {
      control: 'number',
      description: 'Minimum character length',
    },
    maxLength: {
      control: 'number',
      description: 'Maximum character length',
    },
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

function QuickAddFieldWrapper({
  onFormSubmit,
  refuseAdds = false,
  ...fieldProps
}: Omit<ComponentProps<typeof QuickAddField>, 'onAdd'> & {
  onFormSubmit: (values: Record<string, unknown>) => void;
  /** Answer every add as refused, the way a write the session rejects is. */
  refuseAdds?: boolean;
}) {
  const handleAdd: FormSubmitHandler = (values) => {
    // Log to Storybook actions panel
    onFormSubmit(values);

    return refuseAdds
      ? writeSubmissionResult({ meta: { requestStatus: 'rejected' } })
      : { success: true };
  };

  return (
    <div className="flex flex-col items-end gap-4">
      <QuickAddField {...fieldProps} onAdd={handleAdd} />
    </div>
  );
}

const formSubmitAction = fn().mockName('form-submitted');

export const Default: Story = {
  args: {
    name: 'name',
    placeholder: 'Type a name and press enter...',
    disabled: false,
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={formSubmitAction} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The default QuickAddField shows a button that reveals an input when clicked. Type text and press Enter to submit. Check the Actions panel to see submitted values.',
      },
    },
  },
};

export const WithLucideIcon: Story = {
  args: {
    name: 'name',
    placeholder: 'Type a name and press enter...',
    disabled: false,
    icon: 'Smartphone',
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={formSubmitAction} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'QuickAddField whose node type uses a Lucide icon (`Smartphone`) instead of a custom kebab-case icon. Verifies the icon stays vertically centred inside the toggle circle.',
      },
    },
  },
};

export const WithValidation: Story = {
  args: {
    name: 'name',
    placeholder: 'Enter at least 2 characters...',
    disabled: false,
    required: true,
    minLength: 2,
    maxLength: 50,
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={formSubmitAction} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "QuickAddField with validation rules. The field requires a minimum of 2 characters and a maximum of 50. These props mirror what QuickNodeForm now derives from the target variable's codebook `validation` block — see the QuickNodeForm story for that derivation.",
      },
    },
  },
};

// Opens the quick-add input and waits out the 5s usage-hint timer, then waits
// for the tooltip's spring to finish. Motion clears its inline transform on
// completion, so `transform: none` is the terminal state — asserting it keeps
// Chromatic from capturing a half-animated frame.
async function showSettledHint(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('quick-add-toggle'));

  const hint = await screen.findByRole('tooltip', {}, { timeout: 10000 });

  await waitFor(() => {
    const style = getComputedStyle(hint);
    expect(style.opacity).toBe('1');
    expect(style.transform).toBe('none');
  });

  return hint;
}

export const MultiEntryHint: Story = {
  args: {
    name: 'name',
    placeholder: 'Type a name and press enter...',
    disabled: false,
    maxNodes: 0,
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={formSubmitAction} />
  ),
  play: async ({ canvasElement }) => {
    const hint = await showSettledHint(canvasElement);

    await expect(hint).toHaveTextContent(
      'Press Enter when you are finished. The box will stay open so you can quickly enter multiple names in a row.',
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A stage with room for more than one more node keeps the full hint, including the promise that the box stays open. Paired with `SingleEntryHint` so the two copy variants can be compared visually.',
      },
    },
  },
};

export const SingleEntryHint: Story = {
  args: {
    name: 'name',
    placeholder: 'Type a name and press enter...',
    disabled: false,
    maxNodes: 1,
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={formSubmitAction} />
  ),
  play: async ({ canvasElement }) => {
    const hint = await showSettledHint(canvasElement);

    await expect(hint).toHaveTextContent('Press Enter when you are finished.');
    await expect(hint).not.toHaveTextContent('multiple names in a row');
  },
  parameters: {
    docs: {
      description: {
        story:
          'A stage whose remaining `maxNodes` allowance is a single node closes the box on the next successful add, so the usage hint drops its promise that the box stays open.',
      },
    },
  },
};

async function enterName(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('quick-add-toggle'));
  const input = await canvas.findByTestId('quick-add-input');
  await userEvent.type(input, `${name}{Enter}`);
  await waitFor(() => expect(input).not.toBeDisabled());
  return input;
}

const namesAdded = fn().mockName('names-added');

export const NameAdded: Story = {
  args: {
    name: 'name',
    placeholder: 'Type a name and press enter...',
    disabled: false,
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={namesAdded} />
  ),
  play: async ({ canvasElement }) => {
    namesAdded.mockClear();
    const input = await enterName(canvasElement, 'Alice');

    await expect(namesAdded).toHaveBeenCalledWith({ name: 'Alice' });
    await expect(input).toHaveValue('');
    await expect(input).toHaveFocus();

    // The celebration's particles fly at random, so a capture waits for them
    // to clear.
    await waitFor(
      () =>
        expect(
          document.querySelectorAll('body > div[style*="z-index: 50"]'),
        ).toHaveLength(0),
      { timeout: 3000 },
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Once a name is added, the box clears and keeps focus, ready for the next name. Whether to clear comes from the add itself: compare `NameRefused`.',
      },
    },
  },
};

export const NameRefused: Story = {
  args: {
    name: 'name',
    placeholder: 'Type a name and press enter...',
    disabled: false,
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={namesAdded} refuseAdds />
  ),
  play: async ({ canvasElement }) => {
    namesAdded.mockClear();
    const input = await enterName(canvasElement, 'Alice');

    await expect(namesAdded).toHaveBeenCalledWith({ name: 'Alice' });
    await expect(
      await screen.findByText(runtimeMessages.submissionFailed.defaultMessage),
    ).toBeVisible();
    await expect(input).toHaveValue('Alice');
    await expect(input).toHaveFocus();
  },
  parameters: {
    docs: {
      description: {
        story:
          'When an add is refused (here, every add is), the name stays in the box, with the reason shown, so the participant can try again without retyping it.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    name: 'name',
    placeholder: 'Type a name...',
    disabled: true,
  },
  render: ({ icon: _icon, maxNodes: _maxNodes, ...args }) => (
    <QuickAddFieldWrapper {...args} onFormSubmit={formSubmitAction} />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Disabled state prevents interaction with the field.',
      },
    },
  },
};
