import { Cause, Context, Deferred, Effect, Exit, Layer, Ref } from 'effect';

import type { Environment } from '../env.ts';
import type { Keyring, SecretsCipher } from '../secrets/services.ts';
import {
  type SecretKeyCheckError,
  type StoredKeysUnreadable,
  verifyKeyring,
} from '../secrets/verify.ts';
import { SchemaStatus } from './schema-gate.ts';

export type BootRefusal = SecretKeyCheckError | StoredKeysUnreadable;

/**
 * What the API process checks before it serves anything: the schema is this
 * build's, then the keyring opens every key id the database stores (#1900).
 *
 * The process listens before these finish, because an upgrade starts it
 * before `migrate` runs and it must answer, closed, meanwhile (#1901). So the
 * checks run in the background, and the maintenance gate stays closed until
 * `passed` says they did — a closure that holds even when every reading the
 * gate takes from the database fails open, as all of them do against a
 * database whose roles do not exist yet.
 */
export class BootChecks extends Context.Service<
  BootChecks,
  {
    readonly passed: Effect.Effect<boolean>;
  }
>()('@studio/BootChecks') {
  /**
   * A keyring that cannot open what the database stores is a refusal, not a
   * wait: it fails `refusal`, which the program races its server against, so
   * the process exits non-zero with the refusal's sentence.
   */
  static readonly layer = (
    refusal: Deferred.Deferred<never, BootRefusal>,
  ): Layer.Layer<
    BootChecks,
    never,
    SchemaStatus | Keyring | SecretsCipher | Environment
  > =>
    Layer.effect(
      BootChecks,
      Effect.gen(function* () {
        const passed = yield* Ref.make(false);
        yield* SchemaStatus.use((status) => status.current).pipe(
          Effect.andThen(verifyKeyring),
          Effect.andThen(Ref.set(passed, true)),
          Effect.andThen(
            Effect.logInfo('Schema current and keyring verified; serving.'),
          ),
          Effect.onExit((exit) =>
            Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)
              ? Deferred.failCause(refusal, exit.cause)
              : Effect.void,
          ),
          Effect.forkScoped,
        );
        return BootChecks.of({ passed: Ref.get(passed) });
      }),
    );
}
