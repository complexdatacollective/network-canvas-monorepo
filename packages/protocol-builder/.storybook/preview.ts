import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import { definePreview } from '@storybook/react-vite';

import './preview.css';

export default definePreview({
  addons: [addonDocs(), addonA11y()],
  parameters: {
    a11y: { test: 'error' },
    layout: 'fullscreen',
  },
});
