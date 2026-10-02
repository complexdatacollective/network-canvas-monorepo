import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';

import { queryClient } from './lib/queryClient.ts';
import { router } from './router.tsx';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root container');
}

createRoot(container).render(
  <StrictMode>
    {/* Outermost, so every `motion` component Studio renders — all of them by
        way of fresco-ui and @codaco/interview — inherits `reducedMotion="user"`
        (the provider's default). motion then drops transform and layout
        animations by itself for a user who prefers reduced motion, and keeps
        the simple ones, so no component has to branch on the preference. */}
    <AnimationProvider>
      {/* The same client the router carries in its context (§6.1): a guard's
          `fetchQuery` and a component's `queryClient.clear()` have to act on
          one cache. */}
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AnimationProvider>
  </StrictMode>,
);
