import { Schema } from 'effect';
import type { Effect, Scope } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcMiddleware } from 'effect/unstable/rpc';
import { describe, expect, it } from 'vitest';

import { StudioRpcs } from '../rpc/studio.ts';

// A type test. What it guards is a decision, not a behaviour: `Authenticated`
// declares `requiredForClient: false`, because Studio's credential is an
// httpOnly cookie the browser attaches by itself and script cannot read. Flip
// that flag and `RpcClient.make` starts demanding a client-side middleware
// layer from every caller — the web app, the tests, any future client — and
// nothing at runtime would say so. The assertions below therefore live in the
// types: each `Assert<…>` fails `tsc` rather than vitest, so the proof of this
// file is `pnpm --filter @codaco/studio-contract typecheck`. The `it` bodies
// exist so vitest counts the cases and so the types are attached to values
// that are actually used.

/** Fails to compile unless `Condition` is exactly `true`. */
type Assert<Condition extends true> = Condition;

/** Deliberately not distributive: the question is about the whole union. */
type Extends<Subject, Bound> = [Subject] extends [Bound] ? true : false;

type IsNever<T> = [T] extends [never] ? true : false;
type IsNotNever<T> = [T] extends [never] ? false : true;

const clientEffect = RpcClient.make(StudioRpcs);
type Requirements = Effect.Services<typeof clientEffect>;

// The positive control. Without it the two assertions above would also hold if
// `RpcMiddleware.ForClient` had been renamed, or if `Rpc.MiddlewareClient`
// stopped contributing anything at all: `Extract` of a type nothing matches is
// `never` either way. This scratch group declares the one thing the contract
// declines to declare, so the extract it produces must NOT be `never`.
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
