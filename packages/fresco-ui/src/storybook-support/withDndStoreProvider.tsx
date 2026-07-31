import type { Decorator } from '@storybook/react-vite';

import { DndStoreProvider } from '../dnd/DndStoreProvider';

export const withDndStoreProvider: Decorator = (Story) => (
  <DndStoreProvider>
    <Story />
  </DndStoreProvider>
);
