import { Context, Layer, ManagedRuntime } from 'effect';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderClient,
} from '@codaco/protocol-builder-core/contract';

import type { ArchitectStore } from './architectStore.ts';
import { ArchitectHandlers } from './handlers.ts';
import { makeInProcessClient } from './inProcessClient.ts';
import { ArchitectHostSession } from './session.ts';

export class ArchitectHostClient extends Context.Service<
  ArchitectHostClient,
  ProtocolBuilderClient
>()('@codaco/architect/protocolBuilder/ArchitectHostClient') {
  static readonly layer = (store: ArchitectStore, otherTabName: () => string) =>
    Layer.effect(ArchitectHostClient)(
      makeInProcessClient(ProtocolBuilderGroup),
    ).pipe(
      Layer.provide(
        Layer.mergeAll(
          ArchitectHandlers(store, otherTabName),
          ArchitectHostSession,
        ),
      ),
    );
}

export const makeArchitectHostRuntime = (
  store: ArchitectStore,
  otherTabName: () => string,
): ManagedRuntime.ManagedRuntime<ArchitectHostClient, never> =>
  ManagedRuntime.make(ArchitectHostClient.layer(store, otherTabName));
