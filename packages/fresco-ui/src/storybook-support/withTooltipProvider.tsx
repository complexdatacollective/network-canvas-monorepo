import type { Decorator } from '@storybook/react-vite';

import { TooltipProvider } from '../Tooltip';

export const withTooltipProvider: Decorator = (Story) => (
  <TooltipProvider>
    <Story />
  </TooltipProvider>
);
