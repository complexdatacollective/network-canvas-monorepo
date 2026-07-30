import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import addonVitest from '@storybook/addon-vitest';
import { definePreview } from '@storybook/react-vite';
import { StrictMode } from 'react';

import './preview.css';
import Providers from './Providers';

export default definePreview({
  addons: [addonDocs(), addonA11y(), addonVitest()],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Report accessibility violations in Storybook without failing the
      // initial adoption of the test runner.
      test: 'todo',
    },
  },
  decorators: [
    (Story) => {
      // Automated Storybook tests set webdriver; disabling motion keeps their
      // interaction and accessibility results deterministic.
      const disableAnimations =
        typeof navigator !== 'undefined' && navigator.webdriver;

      return (
        <StrictMode>
          <div className="root h-full">
            <Providers disableAnimations={disableAnimations}>
              <Story />
            </Providers>
          </div>
        </StrictMode>
      );
    },
  ],
});
