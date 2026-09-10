import { act, render, screen, type RenderResult } from '@testing-library/react';
import { expect, vi } from 'vitest';

import type { ProtocolBuilderClient } from '../../../contract/contract.ts';
import { withResourceProcedures } from '../../../testing/withResourceProcedures.ts';
import ResourcePreview from '../ResourcePreview.tsx';
import { deferred, type Deferred } from './asyncControls.ts';
import { ResourceContextFrame } from './resourceContext.tsx';
import { createResourceHost } from './resourceHost.ts';

export const HOST_UNAVAILABLE = 'the resource host is temporarily unavailable';

/** The name every preview these tests render is announced under. */
const PREVIEW_NAME = 'Leased image';

/**
 * A host whose `preview` hands out URLs that expire, as a signed delivery URL
 * does, and which the test decides the timing and the outcome of.
 *
 * Every URL carries its own number, so what the researcher is looking at can be
 * matched against what the host has issued and when each one stops resolving.
 * Nothing here is a control being told what to do: `expiresAt` is part of the
 * contract's own preview, and refusing is one of the two things `preview` can
 * answer.
 */
export type PreviewHost = Readonly<{
  client: ProtocolBuilderClient;
  protocolId: string;
  /** Stages an image and answers with its id. */
  image(source: string): Promise<string>;
  /** How long each URL issued from now on lasts; `undefined` for no end. */
  urlsLastFor: (ms: number | undefined) => void;
  /** The next resolution is refused rather than answered with a URL. */
  refuseNext: () => void;
  /** Holds the next resolution until the test settles it. */
  holdNext: () => Deferred<void>;
  issued: () => number;
  /** When each issued URL stops resolving, in the order they were issued. */
  expiries: () => readonly (number | undefined)[];
  /** Told by the test that the preview has gone, so calls can be counted. */
  previewGone: () => void;
  callsAfterGone: () => number;
}>;

export function createPreviewHost(): PreviewHost {
  const host = createResourceHost({ nextId: sequentialImageIds() });
  const { protocolId } = host;
  let issued = 0;
  let livesForMs: number | undefined;
  let refuse = false;
  let held: Deferred<void> | undefined;
  let gone = false;
  let callsAfterGone = 0;
  const expiries: (number | undefined)[] = [];

  const client = withResourceProcedures(host.client, {
    preview: async (input) => {
      if (gone) callsAfterGone += 1;
      const waiting = held;
      held = undefined;
      if (waiting !== undefined) await waiting.promise;
      if (refuse) {
        refuse = false;
        return {
          status: 'failed' as const,
          failure: {
            reason: 'unavailable' as const,
            message: HOST_UNAVAILABLE,
            retryable: true,
          },
        };
      }
      const result = await host.client.resources.preview(input);
      if (result.status !== 'ok') return result;
      issued += 1;
      const expiresAt =
        livesForMs === undefined ? undefined : Date.now() + livesForMs;
      expiries.push(expiresAt);
      return {
        status: 'ok' as const,
        data: {
          resourceId: result.data.resourceId,
          url: `${result.data.url}#url-${issued}`,
          ...(expiresAt === undefined ? {} : { expiresAt }),
        },
      };
    },
  });

  return {
    client,
    protocolId,
    image: (source) => stageImage(client, protocolId, source),
    urlsLastFor: (ms) => {
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
    expiries: () => [...expiries],
    previewGone: () => {
      gone = true;
    },
    callsAfterGone: () => callsAfterGone,
  };
}

function sequentialImageIds(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `image-${issued}`;
  };
}

async function stageImage(
  client: ProtocolBuilderClient,
  protocolId: string,
  source: string,
): Promise<string> {
  const staged = await client.resources.stage({
    protocolId,
    requestId: `request-${source}`,
    request: {
      kind: 'content',
      contentKind: 'image',
      name: source,
      source,
      contentType: 'image/png',
      bytes: new Blob([`png-${source}`], { type: 'image/png' }),
    },
  });
  if (staged.status !== 'ok') throw new Error('could not stage the image');
  return staged.data.descriptor.id;
}

/**
 * The preview in the context it really reads: the package's own client context,
 * with the staging tracker around it that every resource control is given.
 *
 * The cache and the protocol channel `<ProtocolBuilder>` also mounts are left
 * out. A preview reads nothing through them, and these tests run the clock
 * forward by days at a time — which a cache with timers of its own would answer
 * for rather than the component under test.
 */
export function previewOf(
  host: PreviewHost,
  resourceId: string,
  name: string = PREVIEW_NAME,
) {
  return (
    <ResourceContextFrame client={host.client} protocolId={host.protocolId}>
      <ResourcePreview resourceId={resourceId} kind="image" name={name} />
    </ResourceContextFrame>
  );
}

export function renderPreview(
  host: PreviewHost,
  resourceId: string,
  name: string = PREVIEW_NAME,
): RenderResult {
  return render(previewOf(host, resourceId, name));
}

/** Which URL the researcher is looking at, if any. */
export function shownUrl(): number | undefined {
  const source = screen.queryByRole('img')?.getAttribute('src');
  const url = /#url-(\d+)$/.exec(source ?? '')?.[1];
  return url === undefined ? undefined : Number(url);
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

/**
 * The invariant, at whatever moment it is asked: what the researcher is looking
 * at is a URL the host has not said is over.
 *
 * A URL kept past its `expiresAt` is a broken image where a preview was, and it
 * is the failure a renewal exists to prevent.
 */
export function expectShownUrlStillResolves(host: PreviewHost): void {
  const shown = shownUrl();
  if (shown === undefined) return;
  const endsAt = host.expiries()[shown - 1];
  if (endsAt !== undefined) expect(Date.now()).toBeLessThanOrEqual(endsAt);
}
