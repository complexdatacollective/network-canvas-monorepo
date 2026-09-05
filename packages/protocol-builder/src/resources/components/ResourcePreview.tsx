import { useEffect, useState } from 'react';

import { useResourceGateway } from '../context.tsx';
import type {
  ResourceGatewayFailure,
  ResourcePreview as ResolvedPreview,
} from '../gateway.ts';
import { callGateway } from '../gatewayCall.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import type { PreviewableResourceKind } from './resourceKinds.ts';

export type ResourcePreviewProps = Readonly<{
  resourceId: string;
  kind: PreviewableResourceKind;
  /** The resource's name, which is what the media is announced as. */
  name: string;
  className?: string;
}>;

/**
 * How long before a lease ends the next one is asked for.
 *
 * Long enough that the replacement has arrived before the old URL stops
 * resolving, and short enough that a preview open for an hour is re-resolved
 * once rather than continually.
 */
export const PREVIEW_RENEWAL_LEAD_MS = 5_000;

/**
 * The shortest a preview will ever wait before asking for another lease.
 *
 * The lead alone bounds nothing: a lease that ends just after it — a host
 * issuing five-second URLs — leaves a lead of a millisecond, and renewing on
 * it lands another such lease, so the preview asks the host for a URL as fast
 * as it can answer, for as long as it is on screen. A floor makes the renewal
 * a renewal rather than a poll.
 *
 * A lease shorter than the floor therefore runs out before its replacement is
 * asked for, and no policy here can change that: the host will not issue a URL
 * that lives longer than it takes to use. What the preview does about it is
 * stop showing the lease when it lapses — the {@link PreviewState.waiting}
 * state — rather than leave a URL on screen that no longer resolves.
 */
export const PREVIEW_RENEWAL_MIN_INTERVAL_MS = 5_000;

/**
 * Where a preview's lease has got to.
 *
 * Every state says two things: which lease, if any, this preview is holding
 * and showing, and what is scheduled or in flight for it. There is at most one
 * resolution in flight at a time, and at most one lease held.
 */
type PreviewState =
  /** A resolution is in flight and no lease is held; nothing is on screen. */
  | Readonly<{ name: 'resolving' }>
  /**
   * No lease is held and a renewal is scheduled: the lease that was on screen
   * ran out before the renewal floor let another one be asked for. Nothing is
   * on screen until that renewal lands.
   */
  | Readonly<{ name: 'waiting' }>
  /** A lease is on screen; its renewal and its own expiry are scheduled. */
  | Readonly<{ name: 'live'; lease: ResolvedPreview }>
  /** A lease is on screen and its replacement is in flight. */
  | Readonly<{ name: 'renewing'; lease: ResolvedPreview }>
  /**
   * A lease is on screen, its replacement has failed, and the failure is held
   * back until the lease's own expiry.
   */
  | Readonly<{
      name: 'lapsing';
      lease: ResolvedPreview;
      failure: ResourceGatewayFailure;
    }>
  /** A failure is on screen and no lease is held. */
  | Readonly<{ name: 'failed' }>
  /** The effect is over: no lease is held and no timer is armed. */
  | Readonly<{ name: 'released' }>;

/**
 * Renders a resource's content from a URL the host resolved.
 *
 * The URL is a lease, not a fact: the host may be holding an object URL, a
 * signed link, or a cache entry open for as long as this component shows it.
 * A lease that says when it ends is renewed shortly before it does, because a
 * stage editor is left open far longer than a signed URL lives and an image
 * that silently stops loading looks like a resource the protocol lost. The
 * renewal runs alongside the lease it replaces rather than in place of it: the
 * old URL goes on rendering, and is released, only once the new one has
 * arrived. Swapping the moment the renewal *begins* would stop an audio or
 * video element seconds before anything was actually wrong with it, and would
 * throw away the rest of a working lease whenever the host was slow to answer
 * or could not answer at all.
 *
 * ## The invariant
 *
 * **Every lease this preview acquires is released exactly once, and a lease it
 * has released is never what the researcher is looking at.**
 *
 * Both halves matter and they pull against each other, which is why the logic
 * below is one explicit state machine rather than a set of conditions. A host
 * that counts what it has handed out reads a second release as being about the
 * lease it issued next, so releasing twice is as wrong as leaking one; and
 * releasing a lease that is still on screen replaces a working preview with a
 * broken one. Nor can the effect's cleanup be the place a lease is released:
 * it runs on unmount and on a change of resource, and a field simply left open
 * does neither, so a lease that ends while the editor sits there has to be
 * released by the machine itself.
 *
 * ## States and events
 *
 * The states are {@link PreviewState}. The events are: a resolution came back
 * (`resolved` / `resolve-failed`), the renewal timer fired (`renewal-due`), the
 * lease's own expiry timer fired (`lease-expired`), and the effect was torn
 * down by an unmount, a change of resource, or a retry (`torn-down`).
 *
 * | state | event | what happens |
 * | --- | --- | --- |
 * | `resolving` | `resolved` | show it, schedule its renewal and its expiry → `live` |
 * | `resolving` | `resolve-failed` | nothing is on screen, so the failure is → `failed` |
 * | `live` | `renewal-due` | ask for the next lease → `renewing` |
 * | `live` | `lease-expired` | release it and stop showing it → `waiting` |
 * | `renewing` | `resolved` | show the new one, then release the old → `live` |
 * | `renewing` | `resolve-failed`, lease still good | hold the failure → `lapsing` |
 * | `renewing` | `resolve-failed`, lease already over | release it and show the failure → `failed` |
 * | `renewing` | `lease-expired` | release it; the renewal decides for an empty preview → `resolving` |
 * | `lapsing` | `lease-expired` | release it and show the held failure → `failed` |
 * | `waiting` | `renewal-due` | ask again → `resolving` |
 * | `released` | `resolved` | release it at once; nothing else ever will |
 * | any | `torn-down` | release the held lease, clear the timers → `released` |
 *
 * Every other pairing is unreachable — no other state has a resolution in
 * flight or a timer armed — and is a no-op.
 */
export default function ResourcePreview({
  resourceId,
  kind,
  name,
  className,
}: ResourcePreviewProps) {
  const gateway = useResourceGateway();
  const [preview, setPreview] = useState<ResolvedPreview | undefined>(
    undefined,
  );
  const [failure, setFailure] = useState<ResourceGatewayFailure | undefined>(
    undefined,
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let state: PreviewState = { name: 'resolving' };
    let renewal: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setPreview(undefined);
    setFailure(undefined);

    const clearTimers = (): void => {
      if (renewal !== undefined) clearTimeout(renewal);
      if (expiry !== undefined) clearTimeout(expiry);
      renewal = undefined;
      expiry = undefined;
    };

    const resolve = (): void => {
      void (async () => {
        const result = await callGateway(() =>
          gateway.resolvePreview(resourceId),
        );
        if (result.status === 'ok') onResolved(result.data);
        else onResolveFailed(result.failure);
      })();
    };

    /**
     * Takes a lease into use: puts it on screen and schedules everything that
     * can happen to it. The caller has already cleared the previous lease's
     * timers, and releases the lease this one replaces once this returns.
     */
    const show = (lease: ResolvedPreview): void => {
      const { expiresAt } = lease;
      if (expiresAt === undefined) {
        // Nothing said the URL stops working, so asking for another one would
        // be traffic about nothing, and there is no expiry to outlive.
        state = { name: 'live', lease };
        setPreview(lease);
        return;
      }
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        // Over before it arrived. Rendering it would put a URL that no longer
        // resolves on screen; the renewal scheduled here is what brings the
        // preview back.
        state = { name: 'waiting' };
        setPreview(undefined);
        renewal = setTimeout(onRenewalDue, PREVIEW_RENEWAL_MIN_INTERVAL_MS);
        lease.release();
        return;
      }
      state = { name: 'live', lease };
      setPreview(lease);
      renewal = setTimeout(
        onRenewalDue,
        Math.max(
          remaining - PREVIEW_RENEWAL_LEAD_MS,
          PREVIEW_RENEWAL_MIN_INTERVAL_MS,
        ),
      );
      // Armed for every lease, not only for the ones whose renewal is asked
      // for first. A lease shorter than the floor runs out before that ask,
      // and a renewal the host never answers would otherwise leave a dead URL
      // on screen and the host holding it for as long as the editor is open.
      expiry = setTimeout(onLeaseExpired, remaining);
    };

    const onResolved = (lease: ResolvedPreview): void => {
      switch (state.name) {
        case 'released':
          // Nothing will ever render it, and nothing else would ever release
          // it: this is the last place that knows it exists.
          lease.release();
          return;
        case 'renewing': {
          const replaced = state.lease;
          clearTimers();
          show(lease);
          // Let go of the old lease only now: releasing it first is what stops
          // playback the moment a renewal begins rather than when it lands.
          replaced.release();
          return;
        }
        case 'resolving':
          clearTimers();
          show(lease);
          return;
        case 'waiting':
        case 'live':
        case 'lapsing':
        case 'failed':
          // Unreachable: none of these has a resolution in flight.
          return;
      }
    };

    const onResolveFailed = (failed: ResourceGatewayFailure): void => {
      switch (state.name) {
        case 'resolving':
          // Nothing is on screen, so the failure is all there is to show.
          clearTimers();
          state = { name: 'failed' };
          setFailure(failed);
          return;
        case 'renewing': {
          const lease = state.lease;
          const remaining =
            lease.expiresAt === undefined ? 0 : lease.expiresAt - Date.now();
          if (remaining > 0) {
            // The lease being renewed still works for a moment. Replacing a
            // playing image or track with an error message while its own URL
            // is still good throws that time away for nothing; the expiry
            // already scheduled for it is what shows this.
            state = { name: 'lapsing', lease, failure: failed };
            return;
          }
          // The same end, reached without waiting: this lease has already run
          // out, so there is really nothing left to show.
          clearTimers();
          state = { name: 'failed' };
          setPreview(undefined);
          setFailure(failed);
          lease.release();
          return;
        }
        case 'waiting':
        case 'live':
        case 'lapsing':
        case 'failed':
        case 'released':
          // Unreachable, or a resolution for an effect that is already over.
          return;
      }
    };

    const onRenewalDue = (): void => {
      renewal = undefined;
      switch (state.name) {
        case 'live':
          state = { name: 'renewing', lease: state.lease };
          resolve();
          return;
        case 'waiting':
          state = { name: 'resolving' };
          resolve();
          return;
        case 'resolving':
        case 'renewing':
        case 'lapsing':
        case 'failed':
        case 'released':
          return;
      }
    };

    const onLeaseExpired = (): void => {
      expiry = undefined;
      switch (state.name) {
        case 'live': {
          // Shorter than the renewal floor, so it ran out before another could
          // be asked for. The renewal is already scheduled; until it lands the
          // preview shows nothing, which is the truth about a URL that no
          // longer resolves.
          const lease = state.lease;
          state = { name: 'waiting' };
          setPreview(undefined);
          lease.release();
          return;
        }
        case 'renewing': {
          // The replacement has not answered and this lease has nothing left
          // to give, so whatever the renewal decides, it decides it for a
          // preview that is already showing nothing.
          const lease = state.lease;
          state = { name: 'resolving' };
          setPreview(undefined);
          lease.release();
          return;
        }
        case 'lapsing': {
          const { lease, failure: held } = state;
          state = { name: 'failed' };
          setPreview(undefined);
          setFailure(held);
          lease.release();
          return;
        }
        case 'resolving':
        case 'waiting':
        case 'failed':
        case 'released':
          // Unreachable: none of these holds a lease whose expiry is armed.
          return;
      }
    };

    resolve();

    return () => {
      clearTimers();
      const held =
        state.name === 'live' ||
        state.name === 'renewing' ||
        state.name === 'lapsing'
          ? state.lease
          : undefined;
      state = { name: 'released' };
      held?.release();
    };
  }, [attempt, gateway, resourceId]);

  if (failure !== undefined) {
    return (
      <ResourceFailureNotice
        failure={failure}
        retryLabel="Try loading the preview again"
        onRetry={() => setAttempt((current) => current + 1)}
      />
    );
  }

  if (preview === undefined) return null;

  if (kind === 'image') {
    return (
      <img
        src={preview.url}
        alt={name}
        className={className ?? 'max-h-64 w-full rounded object-contain'}
      />
    );
  }

  if (kind === 'video') {
    return (
      // The researcher's own imported media, which carries no caption track;
      // its accessible name is the name the manifest records for it.
      <video
        src={preview.url}
        controls
        aria-label={name}
        className={className ?? 'max-h-64 w-full rounded'}
      />
    );
  }

  return (
    <audio
      src={preview.url}
      controls
      aria-label={name}
      className={className ?? 'w-full'}
    />
  );
}
