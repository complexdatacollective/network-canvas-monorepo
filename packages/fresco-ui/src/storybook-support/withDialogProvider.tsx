import type { Decorator } from '@storybook/react-vite';

import DialogProvider from '../dialogs/DialogProvider';

export const withDialogProvider: Decorator = (Story) => (
  <DialogProvider>
    <Story />
  </DialogProvider>
);
