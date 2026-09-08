import { createApp } from '../../app.ts';
import { readEnv } from '../../env.ts';

const SYNTHETIC_MANAGED_INGRESS_SECRET =
  'synthetic-managed-ingress-secret-at-least-32-characters';
const SYNTHETIC_TRUSTED_PROXIES = ['fdaa::/16'];

/**
 * Creates a real HTTP app behind the same proved proxy boundary as managed
 * production. Generic route tests must traverse that boundary rather than
 * relying on an unconfigured managed process.
 */
export function createHttpTestApp(
  env: NonNullable<Parameters<typeof createApp>[0]> = readEnv(),
  deps: NonNullable<Parameters<typeof createApp>[1]> = {},
) {
  const app = createApp(
    {
      ...env,
      managedIngressSecret: SYNTHETIC_MANAGED_INGRESS_SECRET,
      trustedProxies: SYNTHETIC_TRUSTED_PROXIES,
    },
    deps,
  );
  const dispatch = app.request;
  app.request = (input, requestInit, ...rest) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    for (const [name, value] of new Headers(requestInit?.headers))
      headers.set(name, value);
    headers.set(
      'x-studio-managed-ingress-proof',
      SYNTHETIC_MANAGED_INGRESS_SECRET,
    );
    return dispatch(input, { ...requestInit, headers }, ...rest);
  };
  return app;
}
