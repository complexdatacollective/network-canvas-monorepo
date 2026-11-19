import { Redacted, type Layer } from 'effect';

import {
  HostCaller,
  type HostSession,
} from '@codaco/protocol-builder-core/contract/session';
import {
  fixedHostSession,
  makeInProcessHost,
  type InProcessHost,
} from '@codaco/protocol-builder/host/inProcess';

import type { ArchitectStore } from './architectStore.ts';
import { ArchitectHandlers } from './handlers.ts';
import { ResourceBridge } from './resourceBridge.ts';

const ARCHITECT_CONNECTION = 'architect-local';

export const ArchitectHostSession: Layer.Layer<HostSession> = fixedHostSession(
  HostCaller.of({
    connectionId: ARCHITECT_CONNECTION,
    clientSessionId: ARCHITECT_CONNECTION,
    userId: ARCHITECT_CONNECTION,
    displayName: Redacted.make('This device'),
  }),
);

export type ArchitectClient = InProcessHost &
  Readonly<{
    /**
     * Changes the label a lock holder in another tab is reported under. The
     * handlers read it when they report one, so a change of language needs no
     * new client.
     */
    setOtherTabName: (name: string) => void;
  }>;

export function createArchitectClient(
  store: ArchitectStore,
  otherTabName: string,
): ArchitectClient {
  let currentOtherTabName = otherTabName;
  const resources = new ResourceBridge(store);
  const { adapter, runtime } = makeInProcessHost(
    ArchitectHandlers(store, () => currentOtherTabName, resources),
    ArchitectHostSession,
  );
  return {
    adapter,
    runtime,
    setOtherTabName: (name) => {
      currentOtherTabName = name;
    },
  };
}
