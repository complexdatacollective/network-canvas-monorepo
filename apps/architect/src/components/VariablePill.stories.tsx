import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import type { VariableType } from '@codaco/protocol-validation';

import { VariablePill, type VariablePillProps } from './VariablePill';

const VARIABLE_TYPES = [
  'boolean',
  'categorical',
  'datetime',
  'layout',
  'location',
  'number',
  'ordinal',
  'scalar',
  'text',
] as const satisfies readonly VariableType[];

type StoryArgs = Pick<
  VariablePillProps,
  | 'animated'
  | 'editable'
  | 'label'
  | 'maxWidth'
  | 'minWidth'
  | 'type'
  | 'uuid'
  | 'width'
>;

const STORY_UUID = 'story-variable';

/**
 * The editor the pill opens is connected, so an editable pill needs codebook
 * state to read its variable from. Each story gets its own store, so opening
 * one editor cannot leave state behind for the next example.
 */
const createStoryStore = (variable: Record<string, unknown>) =>
  createStore(() => ({
    activeProtocol: {
      present: {
        codebook: {
          node: {
            person: { name: 'Person', variables: { [STORY_UUID]: variable } },
          },
          edge: {},
          ego: {},
        },
      },
    },
  }));

const meta = {
  title: 'Components/VariablePill',
  component: VariablePill,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
\`VariablePill\` is the single presentation component for every variable
reference in Architect. Its semantics and visual treatment are controlled
independently:

| Props | Element and behavior | Use when |
| --- | --- | --- |
| \`editable={false}\`, \`animated={false}\` | Non-interactive \`<data>\` with a static type-colored border. | Picker options, query previews, stage configuration, and printable output. This is the default. |
| \`editable={false}\`, \`animated\` | Non-interactive \`<data>\` with an animated border. | A static on-screen reference needs extra visual emphasis. Never use this for printable output. |
| \`editable\` | A button that anchors a popover holding the full variable editor. Hover, focus, and tooltip affordances communicate the action. | The variable can be edited. Requires \`uuid\`, since the editor reads and writes the codebook. |
| \`ConnectedVariablePill\` | Resolves \`label\` and \`type\` from a variable UUID, validates uniqueness, then renders \`VariablePill\`. | Architect state owns the variable and edits must update the protocol codebook. |

\`\`\`tsx
// Content-sized between the default 12rem minimum and 20rem maximum.
<VariablePill label="participant_age" type="number" />

// Custom bounds; the label truncates after reaching maxWidth.
<VariablePill
  label="participant_neighbourhood_connection_frequency"
  type="number"
  minWidth="10rem"
  maxWidth="16rem"
/>

<ConnectedVariablePill
  animated
  editable
  uuid={variableId}
  width="100%"
/>
\`\`\`

- \`label\` is both the visible name and the machine-readable \`data\` value
  when the pill is not editable.
- \`type\` selects the variable icon and accent color.
- Without \`width\`, the pill grows with its content between \`minWidth\`
  (default \`12rem\`) and \`maxWidth\` (default \`20rem\`).
- Labels truncate with an ellipsis only after reaching \`maxWidth\`.
- \`width\` forces a preferred CSS width for contexts such as
  \`VariableSpotlight\`; unless \`maxWidth\` is also supplied, that width is
  used as the maximum.
- \`animated\` changes only the border treatment.
- \`editable\` changes the semantic element to a button, adds the raised
  interaction affordance and edit tooltip, and anchors the variable editor.
- The editor opens in a popover anchored to the pill, with the enlarged pill
  as its header: the name field sits inside the pill treatment, and the
  optional synthetic-data section below it. Saving is one atomic codebook
  update, so it is a single undo step; Escape, Cancel, and clicking away all
  confirm before discarding an edited draft.
`,
      },
    },
  },
  args: {
    label: 'participant_age',
    type: 'number',
    animated: false,
    editable: false,
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Displayed variable name.',
    },
    type: {
      control: 'select',
      options: VARIABLE_TYPES,
      description: 'Variable type, which selects the icon and accent color.',
    },
    width: {
      control: 'text',
      description:
        'Optional preferred CSS width. By default, width follows the content.',
    },
    minWidth: {
      control: 'text',
      description: 'Minimum CSS width. Defaults to 12rem.',
    },
    maxWidth: {
      control: 'text',
      description:
        'Maximum CSS width, after which the label truncates. Defaults to 20rem.',
    },
    animated: {
      control: 'boolean',
      description: 'Enables the animated border independently of editing.',
    },
    editable: {
      control: 'boolean',
      description:
        'Makes the pill a button with a tooltip that anchors the variable editor. Requires `uuid`.',
    },
    uuid: {
      control: false,
      description:
        'Codebook id of the variable the editor reads and writes. Required for `editable`.',
    },
  },
  render: (args) => (
    <Provider
      store={createStoryStore({ name: args.label, type: args.type })}
      key={`${args.label}-${args.type}`}
    >
      <VariablePill {...args} />
    </Provider>
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {};

export const Animated: Story = {
  args: {
    animated: true,
  },
};

export const Editable: Story = {
  args: {
    animated: true,
    editable: true,
    uuid: STORY_UUID,
  },
};

export const EditableStaticBorder: Story = {
  args: {
    editable: true,
    uuid: STORY_UUID,
  },
};

export const LongLabel: Story = {
  args: {
    animated: true,
    editable: true,
    uuid: STORY_UUID,
    label: 'participant_neighbourhood_connection_frequency',
    maxWidth: '16rem',
  },
};

export const MinimumWidth: Story = {
  args: {
    label: 'age',
  },
};

export const ContentSized: Story = {
  args: {
    label: 'participant_neighbourhood',
  },
};

export const MaximumWidth: Story = {
  args: {
    label:
      'participant_neighbourhood_connection_frequency_during_the_last_year',
    maxWidth: '16rem',
  },
};

export const FullWidth: Story = {
  args: {
    width: '100%',
  },
  parameters: {
    layout: 'padded',
  },
};
