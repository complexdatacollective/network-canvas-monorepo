import type { Meta, StoryObj } from '@storybook/react-vite';

import { StorageRiskBanner, type StorageRisk } from './StorageRiskBanner';

const messages: Record<StorageRisk, string> = {
  1: 'This browser can remove locally stored data after a period of inactivity.',
  2: 'This browser can remove locally stored data when the device runs low on storage.',
  3: 'Automatic removal is uncommon, but browser-tab storage is not guaranteed.',
};

const meta = {
  title: 'Components/StorageRiskBanner',
  component: StorageRiskBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Import with `import { StorageRiskBanner } from '@codaco/fresco-ui/StorageRiskBanner'`, then compose `<StorageRiskBanner risk={1} installAction={install} onDismiss={dismiss}>Product-specific safety message.</StorageRiskBanner>`. Props: `risk` selects high, medium, or low intent; `children` supplies whole-sentence product copy; `installAction` optionally shows the matching Install button; `installLabel` overrides its label; `onDismiss` handles the dismiss control. The action and dismiss control inherit the selected intent.",
      },
    },
  },
  tags: ['autodocs'],
  args: {
    risk: 1,
    installAction: () => {},
    onDismiss: () => {},
    children: messages[1],
  },
  argTypes: {
    risk: {
      control: 'select',
      options: [1, 2, 3],
      description:
        'Data-loss danger: 1 high, 2 medium, and 3 low. Selects the alert and button intent.',
    },
    children: {
      control: 'text',
      description: 'Product-specific, externalisable safety message.',
    },
    installAction: {
      control: false,
      description: 'Shows the intent-matched Install action when supplied.',
    },
    onDismiss: { control: false },
  },
} satisfies Meta<typeof StorageRiskBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighRisk: Story = {};

export const MediumRisk: Story = {
  args: { risk: 2, children: messages[2] },
};

export const LowRisk: Story = {
  args: { risk: 3, children: messages[3] },
};

export const WithoutInstallAction: Story = {
  args: {
    risk: 2,
    children: messages[2],
    installAction: undefined,
  },
};

export const LongInterviewWarning: Story = {
  args: {
    risk: 1,
    children:
      'Unexported interview research data exists only on this device and can be permanently deleted by the browser, so install the app before beginning data collection and export completed interviews regularly.',
  },
};
