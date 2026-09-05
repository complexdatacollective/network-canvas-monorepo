import { useEffect, useState } from 'react';

import { useResourceGateway } from '../context.tsx';
import type {
  ResourceGatewayFailure,
  ResourcePreview as ResolvedPreview,
} from '../gateway.ts';
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
 * once rather than continually. A lease shorter than this is not renewed
 * ahead of time at all: renewing one the moment it arrives would ask the host
 * for a new URL as fast as it could answer.
 */
export const PREVIEW_RENEWAL_LEAD_MS = 5_000;

/**
 * The shortest a preview will ever wait before asking for another lease.
 *
 * The lead alone bounds nothing: a lease that ends just after it — a host
 * issuing five-second URLs — leaves a lead of a millisecond, and renewing on
 * it lands another such lease, so the preview asks the host for a URL as fast
 * as it can answer, for as long as it is on screen. A floor makes the renewal
 * a renewal rather than a poll. It can let a very short lease lapse between
 * asks, which is the same thing that already happens to a lease shorter than
 * the lead: no policy here can keep a URL alive that the host will not issue
 * for longer than it takes to use.
 */
export const PREVIEW_RENEWAL_MIN_INTERVAL_MS = 5_000;

/**
 * Renders a resource's content from a URL the host resolved.
 *
 * The URL is a lease, not a fact: the host may be holding an object URL, a
 * signed link, or a cache entry open for as long as this component shows it,
 * so `release` is called whenever the component stops showing it — on unmount,
 * and on a change of resource. A resolution that lands after that point is
 * released immediately rather than kept, because nothing else ever will.
 *
 * A lease that says when it ends is renewed shortly before it does, because a
 * stage editor is left open far longer than a signed URL lives and an image
 * that silently stops loading looks like a resource the protocol lost. The
 * renewal runs alongside the lease it replaces rather than in place of it: the
 * old URL goes on rendering, and is released, only once the new one has
 * arrived. Swapping the moment the renewal *begins* would stop an audio or
 * video element seconds before anything was actually wrong with it, and would
 * throw away the rest of a working lease whenever the host was slow to answer
 * or could not answer at all.
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
    let released = false;
    // The lease being rendered right now. A renewal runs alongside it rather
    // than in place of it, so this is replaced only once its replacement has
    // actually arrived.
    let resolved: ResolvedPreview | undefined;
    let renewal: ReturnType<typeof setTimeout> | undefined;
    setPreview(undefined);
    setFailure(undefined);

    const load = async () => {
      const result = await gateway.resolvePreview(resourceId);
      if (released) {
        if (result.status === 'ok') result.data.release();
        return;
      }
      if (result.status === 'failed') {
        const inUse = resolved;
        // Nothing is on screen, so the failure is all there is to show.
        if (inUse === undefined) {
          setFailure(result.failure);
          return;
        }
        // A renewal failed, but the lease it was renewing still works for a
        // moment. Replacing a playing image or track with an error message
        // while its own URL is still good throws that time away for nothing;
        // the researcher is told when there is really nothing left to show.
        const remaining =
          inUse.expiresAt === undefined ? 0 : inUse.expiresAt - Date.now();
        if (remaining <= 0) {
          setFailure(result.failure);
          return;
        }
        renewal = setTimeout(() => setFailure(result.failure), remaining);
        return;
      }
      const previous = resolved;
      resolved = result.data;
      setPreview(result.data);
      // Let go of the old lease only now: releasing it first is what stops
      // playback the moment a renewal begins rather than when it lands.
      previous?.release();

      const { expiresAt } = result.data;
      if (expiresAt === undefined) return;
      const lead = expiresAt - Date.now() - PREVIEW_RENEWAL_LEAD_MS;
      if (lead <= 0) return;
      renewal = setTimeout(
        () => void load(),
        Math.max(lead, PREVIEW_RENEWAL_MIN_INTERVAL_MS),
      );
    };

    void load();

    return () => {
      released = true;
      if (renewal !== undefined) clearTimeout(renewal);
      resolved?.release();
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
