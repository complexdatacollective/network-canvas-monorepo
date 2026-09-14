import { createEnv } from '@t3-oss/env-core';

import { resolve, type StudioEnv } from './env/resolve.ts';
import { serverSchemas, type VariableName } from './env/variables.ts';

// The single sanctioned environment boundary for the Studio server: the only
// module in the app that touches `process.env`, enforced by the repo-wide
// oxlint `node/no-process-env` rule. Everything else takes a `StudioEnv`.

export type {
  AuthEnv,
  DbEnv,
  MailerEnv,
  S3Env,
  SocialProvidersEnv,
  StudioEnv,
} from './env/resolve.ts';
export { isLocalDatabase } from './env/resolve.ts';

/**
 * Everything an entrypoint that runs with no database and auth off can act on
 * (src/netlify.ts). Deliberately an allow-list of what such a lane reads
 * rather than a list of what it drops: a variable added to `variables.ts`
 * later is withheld from that lane by default, and being withheld is the safe
 * direction — the lane exists precisely to be unaffected by settings it does
 * not serve.
 */
const VARIABLES_WITHOUT_DATABASE_OR_AUTH = [
  'NODE_ENV',
  'STUDIO_DEV_DEFAULTS',
  'PORT',
  'HOST',
  'CLIENT_DIST',
  // The Netlify lane is the managed service, and its `status` procedure has
  // to say so; withholding this would make it report `self-hosted` however
  // the site is configured.
  'STUDIO_DEPLOYMENT_MODE',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const satisfies readonly VariableName[];

export type ReadEnvOptions = {
  /**
   * Withholds the database and authentication settings from the read entirely,
   * for an entrypoint that serves neither whatever the deployment defines.
   *
   * The discarding has to happen here rather than on the result. Both stages
   * of the read reject a setting this lane would only throw away: `resolve`
   * refuses a database without a signing secret or a public URL and a
   * half-configured social provider, and before that the schema parse refuses
   * a malformed URL or an under-length secret. Blanking `db` and `auth` on a
   * `StudioEnv` that was never produced is not a degradation any deployment
   * can reach.
   */
  withoutDatabaseOrAuth?: boolean;
};

/**
 * A function rather than a module-scope constant so tests can re-read it after
 * `vi.stubEnv`, and so a validation failure surfaces at the call site that
 * needed the value.
 */
export function readEnv(options: ReadEnvOptions = {}): StudioEnv {
  // An explicit opt-in, not a truthiness check: `Boolean('false')` is `true`,
  // so coercing the raw string would let `SKIP_ENV_VALIDATION=false` disable
  // validation and hand `resolve()` unparsed strings.
  /* oxlint-disable-next-line node/no-process-env -- the boundary itself */
  const skip = process.env.SKIP_ENV_VALIDATION;
  const skipValidation = skip === 'true' || skip === '1';

  /* oxlint-disable-next-line node/no-process-env -- the boundary itself */
  const source = process.env;
  const runtimeEnv = options.withoutDatabaseOrAuth
    ? Object.fromEntries(
        VARIABLES_WITHOUT_DATABASE_OR_AUTH.map((name) => [name, source[name]]),
      )
    : source;

  const raw = createEnv({
    server: serverSchemas,
    runtimeEnv,
    emptyStringAsUndefined: true,
    skipValidation,
  });

  return resolve(raw);
}
