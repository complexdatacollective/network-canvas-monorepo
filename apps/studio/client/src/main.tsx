import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { version } from '../package.json';
import { statusQueryOptions } from './lib/deployment.ts';
import { queryClient } from './lib/queryClient.ts';
import { clientTelemetry } from './lib/telemetry.ts';
import { router } from './router.tsx';

// The same runtime status query as route guards, with no extra consent state.
void queryClient
  .fetchQuery(statusQueryOptions)
  .then((status) =>
    clientTelemetry.start(status.telemetry, {
      mode: status.deployment.mode,
      runtime: 'client',
      version,
    }),
  )
  .catch(() => undefined);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    void clientTelemetry.close();
  });

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root container');
}

createRoot(container, {
  // Retain React's default browser reporting for uncaught render failures.
  // The owned error listener captures that report when telemetry is enabled.
  onCaughtError: (error) => {
    // React's production default logs caught errors locally. Keep that
    // diagnostic even when optional telemetry is disabled or still starting.
    // oxlint-disable-next-line no-console -- preserve React's local failure diagnostic
    console.error(error);
    clientTelemetry.capture('client_render', error);
  },
}).render(
  <StrictMode>
    {/* The same client the router carries in its context (§6.1): a guard's
        `fetchQuery` and a component's `queryClient.clear()` have to act on
        one cache. */}
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
