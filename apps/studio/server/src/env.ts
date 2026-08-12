import { createEnv } from '@t3-oss/env-core';

import { resolve, type StudioEnv } from './env/resolve.ts';
import { serverSchemas } from './env/variables.ts';

// The single sanctioned environment boundary for the Studio server: the only
// module in the app that touches `process.env`, enforced by the repo-wide
// oxlint `node/no-process-env` rule. Everything else takes a `StudioEnv`.
//
// Two layers, because they answer different questions. `createEnv` validates
// variables one at a time against `env/variables.ts`; `env/resolve.ts` then
// builds the domain model from the validated record, applying the rules that
// span several variables at once.

export type {
  AuthEnv,
  DbEnv,
  MailerEnv,
  S3Env,
  SocialProvidersEnv,
  StudioEnv,
} from './env/resolve.ts';

/**
 * Reads and validates the environment. A function rather than a module-scope
 * constant so tests can re-read it after `vi.stubEnv`, and so a validation
 * failure surfaces at the call site that needed the value.
 */
export function readEnv(): StudioEnv {
  const raw = createEnv({
    server: serverSchemas,
    /* oxlint-disable-next-line node/no-process-env -- the boundary itself */
    runtimeEnv: process.env,
    // A variable left blank in an env file means unset, not empty string.
    emptyStringAsUndefined: true,
    /* oxlint-disable-next-line node/no-process-env -- the boundary itself */
    skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
  });

  return resolve(raw);
}
