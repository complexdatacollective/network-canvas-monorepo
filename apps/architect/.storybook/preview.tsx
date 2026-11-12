import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import '@codaco/tailwind-config/fonts/readex-pro.css';
import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import addonVitest from '@storybook/addon-vitest';
import { definePreview } from '@storybook/react-vite';
import { StrictMode } from 'react';

import './preview.css';
import { globalTypes, initialGlobals, mirrorAddon, withAppI18n } from './i18n';
import Providers from './Providers';

export default definePreview({
  // Every story is checked right to left after its play function (see
  // `mirrorAddon` in @codaco/storybook-config, first in `addons` so it runs
  // after the accessibility audit); a story that is not a layout in the
  // reading direction opts out with the `!mirror` tag and says why.
  tags: ['mirror'],
  addons: [mirrorAddon, addonDocs(), addonA11y(), addonVitest()],
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
