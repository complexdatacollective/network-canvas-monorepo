import { assert, describe, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpServer } from 'effect/unstable/http';
import { HttpApiTest } from 'effect/unstable/httpapi';

import { StudioApi } from '@codaco/studio-contract/api/v1';

import { getDeploymentStatus, type InstallationReader } from '../../domain.ts';
import { STUDIO_VERSION } from '../../version.ts';
import { StatusApiHandlers } from '../status.ts';

const handlersReading = (readInstallation: InstallationReader) =>
  Layer.mergeAll(
    StatusApiHandlers({
      capabilities: {
        enabled: true,
        magicLink: true,
        emailAndPassword: true,
        socialProviders: [],
      },
      deployment: getDeploymentStatus('managed'),
      readInstallation,
    }),
    HttpServer.layerServices,
  );

describe('GET /api/v1/status', () => {
  it.effect('names the instance its owner named at setup', () =>
    Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(StudioApi, ['status']);
      assert.deepStrictEqual(yield* client.status.get(), {
        name: 'Acme Lab',
        version: STUDIO_VERSION,
      });
    }).pipe(
      Effect.provide(
        handlersReading(async () => ({
          name: 'Acme Lab',
          ownerUserId: 'user-1',
          bootstrapTokenHash: null,
        })),
      ),
    ),
  );

  it.effect(
    'answers with the product name where there is nothing to read',
    () =>
      Effect.gen(function* () {
        const client = yield* HttpApiTest.groups(StudioApi, ['status']);
        assert.deepStrictEqual(yield* client.status.get(), {
          name: 'Network Canvas Studio',
          version: STUDIO_VERSION,
        });
      }).pipe(Effect.provide(handlersReading(async () => null))),
  );
});
