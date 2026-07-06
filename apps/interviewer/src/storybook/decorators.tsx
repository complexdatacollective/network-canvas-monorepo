import type { Decorator } from '@storybook/react-vite';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';

// Connected fresco-ui `Field`s read/write a form store via context. The app
// mounts one per form (or via the wizard); stories that render a bare Field
// need this decorator so the field has a store to bind to.
export const withFormStore: Decorator = (Story) => (
  <FormStoreProvider>
    <Story />
  </FormStoreProvider>
);
