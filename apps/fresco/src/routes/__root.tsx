import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

import Providers from '~/components/Providers';
import { getRootConfig } from '~/src/server/appConfig';

import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import '~/styles/globals.css';

/**
 * The equivalent of `app/layout.tsx`. The PostHog identify subtree is outside
 * the Phase B slice.
 */
export const Route = createRootRoute({
  loader: () => getRootConfig(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, viewport-fit=cover' },
      { title: 'Network Canvas Fresco' },
      { name: 'description', content: 'Fresco.' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { disableAnimations } = Route.useLoaderData();

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background publish-colors antialiased">
        <div className="root min-h-dvh">
          <Providers
            disableAnimations={disableAnimations}
            nuqsAdapter={NuqsAdapter}
          >
            <Outlet />
          </Providers>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
