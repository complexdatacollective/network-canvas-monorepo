import { Schema } from 'effect';
import type { Effect, Scope } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcMiddleware } from 'effect/rpc';
import { describe, expect, it } from 'vitest';

import { StudioRpcs } from '../rpc/studio.ts';

// A type test: each `Assert<…>` fails `tsc` rather than vitest.

type Assert<Condition extends true> = Condition;

type Extends<Subject, Bound> = [Subject] extends [Bound] ? true : false;

type IsNever<T> = [T] extends [never] ? true : false;
type IsNotNever<T> = [T] extends [never] ? false : true;

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
    const transportAndScopeOnly: Assert<
      Extends<Requirements, RpcClient.Protocol | Scope.Scope>
    > = true;

    expect(transportAndScopeOnly).toBe(true);
  });

  it('never includes a client-side middleware implementation', () => {
    const noClientMiddleware: Assert<
      IsNever<Extract<Requirements, RpcMiddleware.ForClient<unknown>>>
    > = true;

    expect(noClientMiddleware).toBe(true);
  });

  it('would include one for a middleware declaring requiredForClient', () => {
    const probeDemandsClientMiddleware: Assert<
      IsNotNever<Extract<ProbeRequirements, RpcMiddleware.ForClient<unknown>>>
    > = true;

    expect(probeDemandsClientMiddleware).toBe(true);
  });
});
