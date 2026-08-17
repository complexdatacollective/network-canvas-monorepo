import { createEnv } from '@t3-oss/env-core';

import { resolve, type StudioEnv } from './env/resolve.ts';
import { serverSchemas } from './env/variables.ts';

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
 * A function rather than a module-scope constant so tests can re-read it after
 * `vi.stubEnv`, and so a validation failure surfaces at the call site that
 * needed the value.
 */
export function readEnv(): StudioEnv {
  // An explicit opt-in, not a truthiness check: `Boolean('false')` is `true`,
  // so coercing the raw string would let `SKIP_ENV_VALIDATION=false` disable
  // validation and hand `resolve()` unparsed strings.
  /* oxlint-disable-next-line node/no-process-env -- the boundary itself */
  const skip = process.env.SKIP_ENV_VALIDATION;
  const skipValidation = skip === 'true' || skip === '1';

  const raw = createEnv({
    server: serverSchemas,
    /* oxlint-disable-next-line node/no-process-env -- the boundary itself */
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
    skipValidation,
  });

  return resolve(raw);
}
