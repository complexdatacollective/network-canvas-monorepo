import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import addonVitest from '@storybook/addon-vitest';
import { definePreview } from '@storybook/react-vite';
import { StrictMode } from 'react';

import './preview.css';
import { globalTypes, initialGlobals, withAppI18n } from './i18n';
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
    // Three decorators, innermost first. The language and direction sit
    // between the other two: inside the root element, so that element is
    // still the first thing in the canvas, as it was before the toolbar and
    // as a play function that sizes the canvas's first child relies on; and
    // around the providers, so a dialog or toast they render is in the
    // toolbar's language and direction too.
    (Story) => (
      <Providers>
        <Story />
      </Providers>
    ),
    withAppI18n,
    (Story) => (
      <StrictMode>
        <div className="root h-full">
          <Story />
        </div>
      </StrictMode>
    ),
  ],
  globalTypes,
  initialGlobals,
});
