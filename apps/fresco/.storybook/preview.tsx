import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import '@codaco/tailwind-config/fonts/readex-pro.css';
import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import addonVitest from '@storybook/addon-vitest';
import { definePreview } from '@storybook/nextjs-vite';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { StrictMode } from 'react';

import Providers from '../components/Providers';
import { globalTypes, initialGlobals, withAppI18n } from './i18n';

import '../styles/globals.css';

// @chromatic-com/storybook is not included here because it doesn't export a
// CSF Next compatible preview addon. It only provides server-side preset
// functionality and manager UI, so it's configured in main.ts only.
// See: https://github.com/chromaui/addon-visual-tests/pull/404

export default definePreview({
  addons: [addonDocs(), addonA11y(), addonVitest()],
  parameters: {
    options: {
      storySort: {
        order: [
          'Design System',
          ['Colors', 'Elevation', 'Type Scale', 'Typography'],
          'UI',
          'Systems',
          ['Form', 'Dialogs', 'DragAndDrop'],
          'Interview',
          '*',
        ],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
      /**
       * base-ui dialog adds focus guards which are picked up by a11y tests
       * but are necessary for proper focus management within the dialog,
       * and compatible with WCAG guidelines, so we disable this rule here.
       */
      config: {
        rules: [
          {
            id: 'aria-hidden-focus',
            selector: '[data-base-ui-focus-guard]',
            enabled: false,
          },
        ],
      },
    },
  },

  decorators: [
    // Three decorators, innermost first. The language and direction sit
    // between the other two: inside the root element, so that element is
    // still the first thing in the canvas, as it was before the toolbar and
    // as a play function that sizes the canvas's first child relies on; and
    // around the providers, so a dialog or toast they render is in the
    // toolbar's language and direction too.
    // `Providers` also reads the app language's direction, which is a second
    // reason the language has to be around it.
    (Story) => (
      <Providers
        nuqsAdapter={NuqsTestingAdapter}
        disableAnimationsForAutomation
      >
        <Story />
      </Providers>
    ),
    withAppI18n,
    (Story) => (
      // nextjs-vite doesn't seem to pick up the strict mode setting from next config
      <StrictMode>
        {/**
         * required by base-ui: https://base-ui.com/react/overview/quick-start#portals
         */}
        <div className="root h-full">
          <Story />
        </div>
      </StrictMode>
    ),
  ],
  globalTypes,
  initialGlobals,
});
