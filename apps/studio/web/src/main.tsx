import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';

import { resolveInitialLocale } from './i18n/StudioI18nProvider.tsx';
import { queryClient } from './lib/queryClient.ts';
import { studioCatalogSource } from './locales/catalogs.ts';
import { router } from './router.tsx';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root container');
}

// A catalog is a chunk away, so a researcher whose device already speaks
// en-GB would otherwise get a blank page or US English until it arrived. Load
// the locale the provider is about to start in — the same resolution it makes —
// so the first paint is already in their language (design invariant 7). A
// failed load is not the end of the page: the provider asks again when it
// renders, and a second failure reaches the router's error screen.
await studioCatalogSource.load(resolveInitialLocale()).catch(() => undefined);

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
