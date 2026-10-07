import { Console, Effect, Layer, Schema } from 'effect';

import { MaintenanceDatabase } from '../db/client.ts';
import { Environment } from '../env.ts';
import { LoggerLive } from '../platform/logger.ts';
import { TracingLive } from '../platform/tracing.ts';
import { rotateSecrets as rotate } from '../secrets/rotate.ts';
import { Keyring, SecretsCipher } from '../secrets/services.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

class RotateRefused extends Schema.TaggedError<RotateRefused>()(
  'RotateRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

class RotateFailed extends Schema.TaggedError<RotateFailed>()('RotateFailed', {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

const rotateSecrets = Effect.gen(function* () {
  const { db } = yield* Environment;
  if (!db) {
    return yield* new RotateRefused({
      reason:
        'DATABASE_URL is not set; there are no stored secrets to re-encrypt.',
    });
  }

  yield* Console.log(`Network Canvas Studio rotate-secrets ${STUDIO_VERSION}`);

  // The cross-team identity, because rotation must visit every team's rows.
  const Maintenance = MaintenanceDatabase.layer({
    ...db,
    applicationName: 'studio-rotate-secrets',
  });

  const { counts, currentKeyId } = yield* Effect.gen(function* () {
    const keyring = yield* Keyring;
    return {
      counts: yield* rotate(),
      currentKeyId: keyring.currentId,
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(Maintenance, SecretsCipher.layerFromEnvironment),
    ),
    Effect.catch((cause) => new RotateFailed({ cause })),
  );
  for (const [store, rotated] of Object.entries(counts)) {
    yield* Console.log(`${store}: ${rotated} re-sealed`);
  }
  yield* Console.log(
    `Every stored secret is now under key id "${currentKeyId}". ` +
      'The older entries can be removed from the keyring once its backup is updated.',
  );
});

export const RotateSecretsProgram = rotateSecrets.pipe(
  Effect.provide(
    Layer.mergeAll(LoggerLive, TracingLive('rotate-secrets')).pipe(
      Layer.provideMerge(Environment.layer),
    ),
  ),
  // Outside the environment, so a refusal to read it is printed too.
  reportingRefusals,
);
