import { createServerFn } from '@tanstack/react-start';

import { env } from '~/env';

/**
 * `app/layout.tsx` reads `env.CI` in a server component and passes it to the
 * client `<Providers>` as a prop, so no environment variable ever reaches the
 * client bundle. Router loaders are isomorphic, so the same read has to go
 * through a server function to keep that property.
 */
export const getRootConfig = createServerFn({ method: 'GET' }).handler(() => ({
  disableAnimations: env.CI ?? false,
}));
