import type { Meta, StoryObj } from '@storybook/react-vite';

import { StorageRiskBanner, type StorageRisk } from './StorageRiskBanner';

const messages: Record<StorageRisk, string> = {
  1: 'Safari is known to remove Network Canvas data after 7 days of inactivity. Install Architect now to protect your protocols from being deleted.',
  2: 'Firefox may remove Network Canvas data when this device runs low on storage. Allow persistent storage when Firefox asks, and install Architect if your device supports it to protect your protocols from being deleted.',
  3: 'Chrome rarely removes Network Canvas data automatically, but data stored in a browser tab is not guaranteed. Install Architect now to protect your protocols from being deleted.',
};

const meta = {
  title: 'Components/StorageRiskBanner',
  component: StorageRiskBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Import with `import { StorageRiskBanner } from '@codaco/fresco-ui/StorageRiskBanner'`, then compose `<StorageRiskBanner risk={1} installAction={install} onDismiss={dismiss}>Browser- and product-specific safety message.</StorageRiskBanner>`. Props: `risk` selects high, medium, or low intent; `children` supplies whole-sentence browser- and product-specific copy; `installAction` optionally shows the matching Install button; `installLabel` overrides its label; `onDismiss` handles the dismiss control. The action and dismiss control use a white background with the selected intent as their foreground color.",
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
      'Safari is known to remove Network Canvas data after 7 days of inactivity. Install Interviewer now, before collecting data, to protect your interview data from being deleted.',
  },
};
