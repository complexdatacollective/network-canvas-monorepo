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
 * Renders a resource's content from a URL the host resolved.
 *
 * The URL is a lease, not a fact: the host may be holding an object URL, a
 * signed link, or a cache entry open for as long as this component shows it,
 * so `release` is called whenever the component stops showing it — on unmount,
 * and on a change of resource. A resolution that lands after that point is
 * released immediately rather than kept, because nothing else ever will.
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
    let resolved: ResolvedPreview | undefined;
    setPreview(undefined);
    setFailure(undefined);

    const load = async () => {
      const result = await gateway.resolvePreview(resourceId);
      if (result.status === 'failed') {
        if (!released) setFailure(result.failure);
        return;
      }
      if (released) {
        result.data.release();
        return;
      }
      resolved = result.data;
      setPreview(result.data);
    };

    void load();

    return () => {
      released = true;
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
