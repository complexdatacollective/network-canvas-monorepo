import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import addonVitest from '@storybook/addon-vitest';
import { definePreview } from '@storybook/react-vite';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';

import './preview.css';

export default definePreview({
  addons: [addonDocs(), addonA11y(), addonVitest()],
  parameters: {
    layout: 'centered',
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'error',
    },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    (Story) => (
      <AnimationProvider disableAnimationsForAutomation>
        <Story />
      </AnimationProvider>
    ),
  ],
});
