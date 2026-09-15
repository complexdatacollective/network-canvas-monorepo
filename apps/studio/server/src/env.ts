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
 * The mail transport, which only the worker process sends through (#1895).
 * Withheld from every other read: a process that cannot send mail should not
 * be able to observe the credentials for it, and a variable withheld here
 * cannot be wired into the web process by accident later.
 */
const MAIL_VARIABLES = [
  'SMTP_URL',
  'EMAIL_FROM',
] as const satisfies readonly VariableName[];

export type ReadEnvOptions = {
  /**
   * Reads the mail transport, for the one process that sends mail: the worker
   * (#1895). Without it `SMTP_URL` and `EMAIL_FROM` are withheld from the read
   * entirely, so `env.mail` is undefined and a half configuration is neither
   * resolved nor refused here — the worker's own read is where that is caught.
   */
  withMail?: boolean;
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
  const source = { ...process.env };
  // Overwritten rather than filtered out: a variable added to variables.ts
  // later still reaches a read that asked for it, and a read that did not ask
  // for mail never sees these two whatever else it asked for.
  const runtimeEnv = options.withMail
    ? source
    : {
        ...source,
        ...Object.fromEntries(MAIL_VARIABLES.map((name) => [name, undefined])),
      };

  const raw = createEnv({
    server: serverSchemas,
    runtimeEnv,
    emptyStringAsUndefined: true,
    skipValidation,
  });

  return resolve(raw, { withMail: options.withMail === true });
}
