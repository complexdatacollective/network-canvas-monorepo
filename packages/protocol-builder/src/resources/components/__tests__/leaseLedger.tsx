import { act, render, screen, type RenderResult } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { ResourceGatewayProvider } from '../../context.tsx';
import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourcePreview as ResolvedPreview,
  type ResourceResult,
} from '../../gateway.ts';
import type { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import { overrideGateway } from '../../overrideGateway.ts';
import ResourcePreview from '../ResourcePreview.tsx';
import { deferred, type Deferred } from './asyncControls.ts';

export const HOST_UNAVAILABLE = 'the resource host is temporarily unavailable';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * A host handing out leases that end, which counts the releases of each lease
 * separately. Shared by the enumerated interleavings and the fuzz over the
 * same state machine, so both read one lease the same way.
 *
 * Separately, because "released twice" and "one released, one leaked" are the
 * same total and opposite defects. Each lease's URL carries its own number, so
 * what is on screen can be matched against what has been handed back.
 */
export type LeaseLedger = Readonly<{
  /** The host underneath, for staging the resource a row is about. */
  inner: InMemoryResourceGateway;
  gateway: ProtocolBuilderResourceGateway;
  /** How long each lease issued from now on lives; `undefined` for no end. */
  leasesLastFor: (ms: number | undefined) => void;
  /** The next resolution is refused rather than answered with a lease. */
  refuseNext: () => void;
  /** Holds the next resolution until the test settles it. */
  holdNext: () => Deferred<void>;
  issued: () => number;
  /** Release counts, one entry per lease issued, in issue order. */
  releases: () => readonly number[];
}>;

export function leaseLedger(inner: InMemoryResourceGateway): LeaseLedger {
  let issued = 0;
  const releases: number[] = [];
  let livesForMs: number | undefined;
  let refuse = false;
  let held: Deferred<void> | undefined;

  return {
    inner,
    leasesLastFor: (ms) => {
      livesForMs = ms;
    },
    refuseNext: () => {
      refuse = true;
    },
    holdNext: () => {
      held = deferred<void>();
      return held;
    },
    issued: () => issued,
    releases: () => [...releases],
    gateway: overrideGateway(inner, {
      resolvePreview: async (resourceId) => {
        const waiting = held;
        held = undefined;
        if (waiting !== undefined) await waiting.promise;
        if (refuse) {
          refuse = false;
          return resourceFailure<ResolvedPreview>(
            'unavailable',
            HOST_UNAVAILABLE,
          );
        }
        const result = await inner.resolvePreview(resourceId);
        if (result.status === 'failed') return result;
        issued += 1;
        const lease = issued;
        releases.push(0);
        return {
          status: 'ok',
          data: {
            resourceId,
            url: `${result.data.url}#lease-${lease}`,
            ...(livesForMs === undefined
              ? {}
              : { expiresAt: Date.now() + livesForMs }),
            release: () => {
              releases[lease - 1] = (releases[lease - 1] ?? 0) + 1;
              result.data.release();
            },
          },
        } satisfies ResourceResult<ResolvedPreview>;
      },
    }),
  };
}

export async function stageImage(
  gateway: InMemoryResourceGateway,
  requestId: string,
  source: string,
): Promise<string> {
  const staged = await gateway.stageUpload({
    requestId,
    kind: 'image',
    name: source,
    source,
    contentType: 'image/png',
    bytes: bytesOf(`png-${source}`),
  });
  if (staged.status === 'failed') throw new Error('could not stage the image');
  return staged.data.id;
}

export function renderPreview(
  gateway: ProtocolBuilderResourceGateway,
  id: string,
): RenderResult {
  return render(previewOf(gateway, id));
}

export function previewOf(gateway: ProtocolBuilderResourceGateway, id: string) {
  return (
    <ResourceGatewayProvider gateway={gateway}>
      <ResourcePreview resourceId={id} kind="image" name="Leased image" />
    </ResourceGatewayProvider>
  );
}

/** Which lease the researcher is looking at, if any. */
export function shownLease(): number | undefined {
  const source = screen.queryByRole('img')?.getAttribute('src');
  const lease = /#lease-(\d+)$/.exec(source ?? '')?.[1];
  return lease === undefined ? undefined : Number(lease);
}

/** Moves both clocks, and lets everything they start settle. */
export async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Lets a held call's answer arrive without moving the timer clock — a tab in
 * the background, where `setTimeout` is throttled to minutes while promises go
 * on resolving as promptly as ever.
 */
export async function settleWithoutTimers(): Promise<void> {
  await act(async () => {
    for (let hop = 0; hop < 10; hop += 1) await Promise.resolve();
  });
}

/** The second half of the invariant, at whatever moment it is asked. */
export function expectShownLeaseIsHeld(ledger: LeaseLedger): void {
  const shown = shownLease();
  if (shown === undefined) return;
  expect(ledger.releases()[shown - 1]).toBe(0);
}

/**
 * The first half of the invariant, once the preview is gone: by then nothing
 * is left to release anything, so any lease not released exactly once here
 * never will be.
 */
export function expectEveryLeaseReleasedOnce(ledger: LeaseLedger): void {
  expect(ledger.releases()).toEqual(
    Array.from({ length: ledger.issued() }, () => 1),
  );
}
