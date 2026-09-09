import { useEffect, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import type {
  ResourceGatewayFailure,
  ResourcePreview as ResolvedPreview,
} from '../types.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import type { PreviewableResourceKind } from './resourceKinds.ts';
import { useResourceClientRef } from './useResourceClientRef.ts';

const messages = defineMessages({
  retry: {
    id: 'protocolBuilder.resourcePreview.retry',
    defaultMessage: 'Try loading the preview again',
    description:
      'Button beside a failure notice, which asks the host again for the URL that displays an imported image, video, or audio file. Named rather than generic because several parts of one field can be failing at once.',
  },
});

export type ResourcePreviewProps = Readonly<{
  resourceId: string;
  kind: PreviewableResourceKind;
  /** The resource's name, which is what the media is announced as. */
  name: string;
  className?: string;
}>;

/**
 * How long before a URL expires the next one is asked for.
 *
 * Long enough that the replacement has arrived before the old URL stops
 * resolving, and short enough that a preview open for an hour is re-resolved
 * once rather than continually.
 */
export const PREVIEW_RENEWAL_LEAD_MS = 5_000;

/**
 * The shortest a preview will ever wait before asking for another URL.
 *
 * The lead alone bounds nothing: a URL that expires just after it — a host
 * issuing five-second links — leaves a lead of a millisecond, and renewing on
 * it lands another such link, so the preview asks the host for a URL as fast
 * as it can answer, for as long as it is on screen. A floor makes the renewal
 * a renewal rather than a poll.
 *
 * A URL shorter-lived than the floor therefore expires before its replacement
 * is asked for, and no policy here can change that: the host will not issue a
 * URL that lives longer than it takes to use. What the preview does about it is
 * stop showing the URL when it lapses — the {@link PreviewState.waiting} state
 * — rather than leave one on screen that no longer resolves.
 */
export const PREVIEW_RENEWAL_MIN_INTERVAL_MS = 5_000;

/**
 * The longest delay a timer can be asked to hold: 2³¹ − 1 milliseconds, about
 * 24.8 days. `setTimeout` keeps its delay in a signed 32-bit field, and a
 * larger one wraps — to a small number, or in some runtimes to zero — so the
 * timer fires at once instead of far in the future.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** One armed timer, however far away the moment it is armed for. */
type PreviewTimer = Readonly<{ cancel: () => void }>;

/**
 * Runs `wake` in `delayMs`, for any delay `expiresAt` can describe.
 *
 * A host issuing month-long signed URLs is ordinary, and the delay that
 * describes one is past what a timer can hold: asked for it directly, the
 * timer fires immediately, so the URL is renewed the moment it arrives — and
 * since each replacement is just as long-lived, the preview goes on asking the
 * host for URLs as fast as it can answer them. So a long wait is served in
 * instalments of the largest delay the platform does hold, and the work happens
 * only when the whole of it has passed.
 */
function armTimer(wake: () => void, delayMs: number): PreviewTimer {
  let handle: ReturnType<typeof setTimeout>;
  let remaining = Math.max(delayMs, 0);
  const arm = (): void => {
    const step = Math.min(remaining, MAX_TIMER_DELAY_MS);
    remaining -= step;
    handle = setTimeout(remaining > 0 ? arm : wake, step);
  };
  arm();
  return Object.freeze({ cancel: () => clearTimeout(handle) });
}

/**
 * Where a preview's URL has got to.
 *
 * Every state says two things: which resolved URL, if any, this preview is
 * showing, and what is scheduled or in flight for it. There is at most one
 * resolution in flight at a time.
 */
type PreviewState =
  /** A resolution is in flight and nothing is on screen. */
  | Readonly<{ name: 'resolving' }>
  /**
   * Nothing is on screen and a renewal is scheduled: the URL that was showing
   * expired before the renewal floor let another one be asked for. Nothing is
   * on screen until that renewal lands.
   */
  | Readonly<{ name: 'waiting' }>
  /** A URL is on screen; its renewal and its own expiry are scheduled. */
  | Readonly<{ name: 'live'; resolved: ResolvedPreview }>
  /** A URL is on screen and its replacement is in flight. */
  | Readonly<{ name: 'renewing'; resolved: ResolvedPreview }>
  /**
   * A URL is on screen, its replacement has failed, and the failure is held
   * back until the URL's own expiry.
   */
  | Readonly<{
      name: 'lapsing';
      resolved: ResolvedPreview;
      failure: ResourceGatewayFailure;
    }>
  /** A failure is on screen and nothing is showing. */
  | Readonly<{ name: 'failed' }>
  /** The effect is over: nothing is shown and no timer is armed. */
  | Readonly<{ name: 'ended' }>;

/**
 * Renders a resource's content from a URL the host resolved.
 *
 * The URL is a lease, not a fact: a host may answer with a signed link that
 * stops resolving, and it says when by putting an `expiresAt` on its answer.
 * One that says so is renewed shortly before it does, because a stage editor
 * is left open far longer than a signed URL lives and an image that silently
 * stops loading looks like a resource the protocol lost. The renewal runs
 * alongside the URL it replaces rather than in place of it: the old one goes on
 * rendering until the new one has arrived. Swapping the moment the renewal
 * *begins* would stop an audio or video element seconds before anything was
 * actually wrong with it, and would throw away the rest of a working URL
 * whenever the host was slow to answer or could not answer at all.
 *
 * ## The invariant
 *
 * **What the researcher is looking at is a URL the host has not said is over,
 * for the resource this preview is currently about.**
 *
 * Both halves matter. A URL kept past its `expiresAt` is a broken image where
 * a preview was; and a resolution that lands after the field has moved to
 * another resource would put the previous resource's content under the new
 * one's name. The effect's own cleanup cannot settle either on its own — a
 * field simply left open neither unmounts nor changes resource, so a URL that
 * expires while the editor sits there has to be taken off screen by the machine
 * itself — which is why the logic below is one explicit state machine rather
 * than a set of conditions.
 *
 * ## States and events
 *
 * The states are {@link PreviewState}. The events are: a resolution came back
 * (`resolved` / `resolve-failed`), the renewal timer fired (`renewal-due`), the
 * URL's own expiry timer fired (`expired`), and the effect was torn down by an
 * unmount, a change of resource, or a retry (`torn-down`).
 *
 * | state | event | what happens |
 * | --- | --- | --- |
 * | `resolving` | `resolved` | show it, schedule its renewal and its expiry → `live` |
 * | `resolving` | `resolve-failed` | nothing is on screen, so the failure is → `failed` |
 * | `live` | `renewal-due` | ask for the next URL → `renewing` |
 * | `live` | `expired` | stop showing it → `waiting` |
 * | `renewing` | `resolved` | show the new one → `live` |
 * | `renewing` | `resolve-failed`, the URL still good | hold the failure → `lapsing` |
 * | `renewing` | `resolve-failed`, the URL already over | show the failure → `failed` |
 * | `renewing` | `expired` | stop showing it; the renewal decides for an empty preview → `resolving` |
 * | `lapsing` | `expired` | stop showing it and show the held failure → `failed` |
 * | `waiting` | `renewal-due` | ask again → `resolving` |
 * | `ended` | anything | nothing: this effect is not what is on screen any more |
 * | any | `torn-down` | clear the timers → `ended` |
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
  const resources = useResourceClientRef();
  const intl = useAppIntl();
  const [preview, setPreview] = useState<ResolvedPreview | undefined>(
    undefined,
  );
  const [failure, setFailure] = useState<ResourceGatewayFailure | undefined>(
    undefined,
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let state: PreviewState = { name: 'resolving' };
    let renewal: PreviewTimer | undefined;
    let expiry: PreviewTimer | undefined;
    setPreview(undefined);
    setFailure(undefined);

    const clearTimers = (): void => {
      renewal?.cancel();
      expiry?.cancel();
      renewal = undefined;
      expiry = undefined;
    };

    const resolve = (): void => {
      void (async () => {
        const result = await resources.current.resolvePreview(resourceId);
        if (result.status === 'ok') onResolved(result.data);
        else onResolveFailed(result.failure);
      })();
    };

    /**
     * Takes a resolved URL into use: puts it on screen and schedules everything
     * that can happen to it. The caller has already cleared the previous one's
     * timers.
     */
    const show = (resolved: ResolvedPreview): void => {
      const { expiresAt } = resolved;
      if (expiresAt === undefined) {
        // Nothing said the URL stops working, so asking for another one would
        // be traffic about nothing, and there is no expiry to outlive.
        state = { name: 'live', resolved };
        setPreview(resolved);
        return;
      }
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        // Over before it arrived. Rendering it would put a URL that no longer
        // resolves on screen; the renewal scheduled here is what brings the
        // preview back.
        state = { name: 'waiting' };
        setPreview(undefined);
        renewal = armTimer(onRenewalDue, PREVIEW_RENEWAL_MIN_INTERVAL_MS);
        return;
      }
      state = { name: 'live', resolved };
      setPreview(resolved);
      renewal = armTimer(
        onRenewalDue,
        Math.max(
          remaining - PREVIEW_RENEWAL_LEAD_MS,
          PREVIEW_RENEWAL_MIN_INTERVAL_MS,
        ),
      );
      // Armed for every URL, not only for the ones whose renewal is asked for
      // first. One shorter-lived than the floor expires before that ask, and a
      // renewal the host never answers would otherwise leave a dead URL on
      // screen for as long as the editor is open.
      expiry = armTimer(onExpired, remaining);
    };

    const onResolved = (resolved: ResolvedPreview): void => {
      switch (state.name) {
        case 'renewing':
        case 'resolving':
          clearTimers();
          show(resolved);
          return;
        case 'waiting':
        case 'live':
        case 'lapsing':
        case 'failed':
          // Unreachable: none of these has a resolution in flight.
          return;
        case 'ended':
          // An answer about the resource this preview used to be about, or one
          // for a preview that has gone. Rendering it would put the previous
          // resource's content under the current one's name.
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
          const { resolved } = state;
          const remaining =
            resolved.expiresAt === undefined
              ? 0
              : resolved.expiresAt - Date.now();
          if (remaining > 0) {
            // The URL being renewed still works for a moment. Replacing a
            // playing image or track with an error message while its own URL
            // is still good throws that time away for nothing; the expiry
            // already scheduled for it is what shows this.
            state = { name: 'lapsing', resolved, failure: failed };
            return;
          }
          // The same end, reached without waiting: this URL has already run
          // out, so there is really nothing left to show.
          clearTimers();
          state = { name: 'failed' };
          setPreview(undefined);
          setFailure(failed);
          return;
        }
        case 'waiting':
        case 'live':
        case 'lapsing':
        case 'failed':
        case 'ended':
          // Unreachable, or a resolution for an effect that is already over.
          return;
      }
    };

    const onRenewalDue = (): void => {
      renewal = undefined;
      switch (state.name) {
        case 'live':
          state = { name: 'renewing', resolved: state.resolved };
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
        case 'ended':
          return;
      }
    };

    const onExpired = (): void => {
      expiry = undefined;
      switch (state.name) {
        case 'live':
          // Shorter-lived than the renewal floor, so it ran out before another
          // could be asked for. The renewal is already scheduled; until it
          // lands the preview shows nothing, which is the truth about a URL
          // that no longer resolves.
          state = { name: 'waiting' };
          setPreview(undefined);
          return;
        case 'renewing':
          // The replacement has not answered and this URL has nothing left to
          // give, so whatever the renewal decides, it decides it for a preview
          // that is already showing nothing.
          state = { name: 'resolving' };
          setPreview(undefined);
          return;
        case 'lapsing': {
          const { failure: held } = state;
          state = { name: 'failed' };
          setPreview(undefined);
          setFailure(held);
          return;
        }
        case 'resolving':
        case 'waiting':
        case 'failed':
        case 'ended':
          // Unreachable: none of these has an expiry armed.
          return;
      }
    };

    resolve();

    return () => {
      clearTimers();
      state = { name: 'ended' };
    };
  }, [attempt, resourceId, resources]);

  if (failure !== undefined) {
    return (
      <ResourceFailureNotice
        failure={failure}
        retryLabel={intl.formatMessage(messages.retry)}
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
