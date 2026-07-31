import { Toast } from '@base-ui/react/toast';
import type { Decorator } from '@storybook/react-vite';

import { Toaster } from '../Toast';

export const withToastProvider: Decorator = (Story) => (
  <Toast.Provider limit={7}>
    <Story />
    <Toaster />
  </Toast.Provider>
);
