import {
  PWA_BUILD_LEASE_READY,
  PWA_BUILD_LEASE_REQUEST,
  PWA_BUILD_LEASE_RESPONSE,
} from './pwaBuildLeaseMessages';

export {
  PWA_BUILD_LEASE_READY,
  PWA_BUILD_LEASE_REQUEST,
  PWA_BUILD_LEASE_RESPONSE,
};

type BuildLeaseRequest = {
  type: typeof PWA_BUILD_LEASE_REQUEST;
  requestId: string;
};

type MessageTargetLike = {
  postMessage: (message: unknown) => void;
};

type ServiceWorkerContainerLike = Pick<
  EventTarget,
  'addEventListener' | 'removeEventListener'
> & {
  controller: MessageTargetLike | null;
};

function isBuildLeaseRequest(value: unknown): value is BuildLeaseRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BuildLeaseRequest>;
  return (
    candidate.type === PWA_BUILD_LEASE_REQUEST &&
    typeof candidate.requestId === 'string'
  );
}

function isMessageTarget(value: unknown): value is MessageTargetLike {
  return (
    value !== null &&
    typeof value === 'object' &&
    'postMessage' in value &&
    typeof value.postMessage === 'function'
  );
}

function getServiceWorkerContainer(): ServiceWorkerContainerLike | undefined {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }
  return navigator.serviceWorker;
}

/**
 * Lets the active service worker identify the build used by this document.
 *
 * A worker activated with `skipWaiting()` can control documents rendered by
 * older bundles. Those documents may still need lazy chunks from their own
 * precache, so the worker must not reclaim a build cache until every open
 * document has explicitly leased a different cache. A document that predates
 * this handshake never responds, which deliberately blocks reclamation.
 */
export function registerPwaBuildLease(
  buildId: string,
  serviceWorker = getServiceWorkerContainer(),
): () => void {
  if (!serviceWorker) return () => undefined;

  const announceReady = () => {
    serviceWorker.controller?.postMessage({
      type: PWA_BUILD_LEASE_READY,
      buildId,
    });
  };

  const onMessage: EventListener = (event) => {
    if (!(event instanceof MessageEvent)) return;
    if (!isBuildLeaseRequest(event.data)) return;

    // A service-worker message exposes the sending worker as `source`. Reply
    // directly so a controller transition cannot send the lease to a
    // different worker than the one that requested it.
    const source: unknown = event.source;
    if (!isMessageTarget(source)) return;
    source.postMessage({
      type: PWA_BUILD_LEASE_RESPONSE,
      requestId: event.data.requestId,
      buildId,
    });
  };

  const onVisible = () => {
    if (
      typeof document === 'undefined' ||
      document.visibilityState === 'visible'
    ) {
      announceReady();
    }
  };

  serviceWorker.addEventListener('message', onMessage);
  serviceWorker.addEventListener('controllerchange', announceReady);
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', announceReady);
    window.addEventListener('pageshow', announceReady);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }
  announceReady();

  return () => {
    serviceWorker.removeEventListener('message', onMessage);
    serviceWorker.removeEventListener('controllerchange', announceReady);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', announceReady);
      window.removeEventListener('pageshow', announceReady);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}
