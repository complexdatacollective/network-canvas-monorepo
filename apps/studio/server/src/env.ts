import { Context, Effect, Layer } from 'effect';

import { resolve, type StudioEnv } from './env/resolve.ts';
import { decodeEnvironment, type VariableName } from './env/schema.ts';

// The single sanctioned environment boundary for the Studio server: the only
// module in the app that touches `process.env`. Everything else takes a
// `StudioEnv`.
//
// Enforced for this server's source by oxlint's `node/no-process-env`,
// together with a ban on importing `node:process` — the linter only sees
// `process.env` reached through the global. Both are in the
// `apps/studio/server/src/**` override in the repository's `.oxlintrc.json`;
// the repo-wide `no-process-env` entry beside it is inert, because the `node`
// plugin it belongs to is not in the repo-wide `plugins` list.
//
// Two layers of validation, both of them declarative: `src/env/schema.ts` is
// one Effect `Schema.Struct` saying what each variable must look like, and
// `src/env/resolve.ts` applies the rules that span several at once
// (all-or-nothing `S3_*`, the `SMTP_URL`/`EMAIL_FROM` pairing, the database
// password file, the keyring).

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
  /* oxlint-disable-next-line node/no-process-env -- the boundary itself */
  const source: Readonly<Record<string, string | undefined>> = process.env;

  // Removed rather than filtered down to a known list: a variable added to
  // the schema later still reaches a read that asked for it, and a read that
  // did not ask for mail never sees these two whatever else it asked for.
  const withheld = new Set<string>(options.withMail ? [] : MAIL_VARIABLES);
  const visible = Object.fromEntries(
    Object.entries(source).filter(([name]) => !withheld.has(name)),
  );

  return resolve(decodeEnvironment(visible), {
    withMail: options.withMail === true,
  });
}

/**
 * The resolved environment as an Effect service, which is how Effect code asks
 * for it: `const env = yield* Environment`. Nothing runs under Effect yet —
 * the server is a Hono app and a pg-boss worker — so nothing consumes this but
 * its own test. It exists so that the first module that does run under Effect
 * has a sanctioned way in rather than reaching for `readEnv` from inside a
 * fiber, and because `Layer` is what makes "decoded and resolved once, at the
 * edge of the program" a property of the wiring instead of a convention.
 *
 * `Layer.effect` rather than `Layer.succeed`: the read must happen when the
 * layer is built, not when this module is imported, or a failure would be
 * thrown during module loading where nothing can report it usefully. Layers
 * are memoised, so a program that provides this one decodes once however many
 * services ask for it.
 */
export class Environment extends Context.Service<Environment, StudioEnv>()(
  '@studio/Environment',
) {
  /** For a process that does not send mail: the web process, and every script. */
  static readonly layer = Layer.effect(
    Environment,
    Effect.sync(() => readEnv()),
  );

  /** For the worker, the one process that sends mail (#1895). */
  static readonly layerWithMail = Layer.effect(
    Environment,
    Effect.sync(() => readEnv({ withMail: true })),
  );
}
