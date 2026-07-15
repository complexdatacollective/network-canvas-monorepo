import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import ThemeSwitcher from './ThemeSwitcher';
import type { ThemeSwitcherTheme } from './ThemeSwitcher';

const labels = {
  label: 'Color theme',
  triggerLabel: (theme: ThemeSwitcherTheme) => `Color theme: ${theme}`,
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const documentation = `
A controlled colour-theme picker for the utility slot in \`SiteNavigation\`.
The host owns persistence and localisation, so the component can be shared
without requiring a particular theme provider or i18n framework.

\`\`\`tsx
<ThemeSwitcher
  labels={themeLabels}
  theme={theme}
  onThemeChange={setTheme}
  view="desktop"
/>
\`\`\`

- **\`theme\`** accepts \`light\`, \`dark\`, or \`system\`; unexpected values
  safely fall back to \`system\` until the host restores its preference.
- **\`labels\`** provides the visible and accessible copy for localisation.
- **\`view\`** matches the desktop or compact navigation context.
`;

const meta = {
  title: 'Navigation/ThemeSwitcher',
  component: ThemeSwitcher,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  argTypes: {
    theme: {
      control: 'radio',
      options: ['light', 'dark', 'system'],
    },
    view: {
      control: 'radio',
      options: ['desktop', 'mobile'],
    },
  },
  args: {
    labels,
    onThemeChange: () => {},
    theme: 'system',
    view: 'desktop',
  },
  render: ({ theme: initialTheme, ...args }) => {
    const [theme, setTheme] = useState(initialTheme);
    return <ThemeSwitcher {...args} theme={theme} onThemeChange={setTheme} />;
  },
} satisfies Meta<typeof ThemeSwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CompactNavigation: Story = {
  args: { view: 'mobile' },
};
