import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import { definePreview } from '@storybook/react-vite';

import './preview.css';
import { globalTypes, initialGlobals, withAppI18n } from './i18n.ts';

export default definePreview({
  addons: [addonDocs(), addonA11y()],
  parameters: {
    a11y: { test: 'error' },
    layout: 'fullscreen',
  },
  // The only decorator, and outermost by construction: a story that mounts its
  // own providers does so inside the locale, not around it.
  decorators: [withAppI18n],
  globalTypes,
  initialGlobals,
});
