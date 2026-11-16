import { Schema } from 'effect';
import type { Effect, Scope } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcMiddleware } from 'effect/rpc';
import { describe, expectTypeOf, it } from 'vitest';

import { StudioRpcs } from '../rpc/studio.ts';

// A type test: `tsc` checks each `expectTypeOf`; vitest only runs the file.

const clientEffect = RpcClient.make(StudioRpcs);
type Requirements = Effect.Services<typeof clientEffect>;

class ProbeCredential extends RpcMiddleware.Service<ProbeCredential>()(
  'probe/Credential',
  { requiredForClient: true },
) {}

const ProbeRpcs = RpcGroup.make(
  Rpc.make('probe.ping', { success: Schema.String }),
).middleware(ProbeCredential);

const probeClientEffect = RpcClient.make(ProbeRpcs);
type ProbeRequirements = Effect.Services<typeof probeClientEffect>;

describe('what RpcClient.make(StudioRpcs) asks its caller for', () => {
  it('is a transport and a scope, and nothing else', () => {
    expectTypeOf<Requirements>().toExtend<RpcClient.Protocol | Scope.Scope>();
  });

  it('never includes a client-side middleware implementation', () => {
    expectTypeOf<
      Extract<Requirements, RpcMiddleware.ForClient<unknown>>
    >().toBeNever();
  });

  it('would include one for a middleware declaring requiredForClient', () => {
    expectTypeOf<
      Extract<ProbeRequirements, RpcMiddleware.ForClient<unknown>>
    >().not.toBeNever();
  });
});
