import type { Plugin } from 'vite';

import {
  PWA_BUILD_LEASE_READY,
  PWA_BUILD_LEASE_REQUEST,
  PWA_BUILD_LEASE_RESPONSE,
} from '../packages/fresco-ui/src/appUpdate/pwaBuildLeaseMessages.ts';

type PwaCacheReclamationPluginOptions = {
  appCachePrefix: string;
  buildId: string;
  responseTimeoutMs?: number;
};

const BUILD_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function getPwaCacheReclamationScriptFileName(buildId: string): string {
  if (!BUILD_ID_PATTERN.test(buildId)) {
    throw new Error(`Invalid PWA build ID: ${buildId}`);
  }
  return `pwa-cache-reclamation-${buildId}.js`;
}

export function createPwaCacheReclamationWorkerSource({
  appCachePrefix,
  buildId,
  responseTimeoutMs = 750,
}: PwaCacheReclamationPluginOptions): string {
  if (!appCachePrefix || !buildId.startsWith(appCachePrefix)) {
    throw new Error(
      `PWA build ID ${buildId} must start with ${appCachePrefix || 'a non-empty app cache prefix'}`,
    );
  }
  if (!Number.isSafeInteger(responseTimeoutMs) || responseTimeoutMs <= 0) {
    throw new Error('PWA lease response timeout must be a positive integer');
  }

  return `(() => {
  'use strict';

  const appCachePrefix = ${JSON.stringify(appCachePrefix)};
  const currentBuildId = ${JSON.stringify(buildId)};
  const metadataCacheName = appCachePrefix + 'pwa-cache-metadata';
  const activeBuildKey = new URL('__pwa-active-build__', self.registration.scope).href;
  const leaseRequestType = ${JSON.stringify(PWA_BUILD_LEASE_REQUEST)};
  const leaseResponseType = ${JSON.stringify(PWA_BUILD_LEASE_RESPONSE)};
  const leaseReadyType = ${JSON.stringify(PWA_BUILD_LEASE_READY)};
  const responseTimeoutMs = ${responseTimeoutMs};
  let reclamationPromise;

  const isBuildPrecache = (cacheName, candidateBuildId) =>
    cacheName === candidateBuildId + '-precache' ||
    cacheName.startsWith(candidateBuildId + '-precache-');

  const writeActiveBuild = async () => {
    const metadata = await caches.open(metadataCacheName);
    await metadata.put(activeBuildKey, new Response(currentBuildId));
  };

  const readActiveBuild = async () => {
    const metadata = await caches.open(metadataCacheName);
    const response = await metadata.match(activeBuildKey);
    return response ? response.text() : undefined;
  };

  const isScopedWindow = (client) => {
    try {
      const scope = new URL(self.registration.scope);
      const clientUrl = new URL(client.url);
      return (
        clientUrl.origin === scope.origin &&
        clientUrl.pathname.startsWith(scope.pathname)
      );
    } catch {
      return false;
    }
  };

  const requestBuildLeases = async () => {
    const clients = (
      await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    ).filter(isScopedWindow);
    if (clients.length === 0) return new Set();

    const clientIds = new Set(clients.map((client) => client.id));
    const responses = new Map();
    const requestId = currentBuildId + ':' + crypto.randomUUID();

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId;
      const finish = (leases) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        self.removeEventListener('message', onMessage);
        resolve(leases);
      };
      const onMessage = (event) => {
        const data = event.data;
        const sourceId = event.source && event.source.id;
        if (
          !data ||
          data.type !== leaseResponseType ||
          data.requestId !== requestId ||
          typeof data.buildId !== 'string' ||
          !data.buildId.startsWith(appCachePrefix) ||
          !sourceId ||
          !clientIds.has(sourceId)
        ) {
          return;
        }

        responses.set(sourceId, data.buildId);
        if (responses.size === clients.length) {
          finish(new Set(responses.values()));
        }
      };

      self.addEventListener('message', onMessage);
      timeoutId = setTimeout(() => finish(undefined), responseTimeoutMs);
      for (const client of clients) {
        client.postMessage({ type: leaseRequestType, requestId });
      }
    });
  };

  const reclaimUnleasedPrecaches = async () => {
    // A redundant worker can continue executing briefly after an update. Only
    // the worker that most recently activated may reclaim caches.
    if ((await readActiveBuild()) !== currentBuildId) return;

    // Never inspect/delete while another build is being installed. Its cache
    // can exist before it becomes the waiting worker.
    if (self.registration.installing || self.registration.waiting) return;

    const leasedBuildIds = await requestBuildLeases();
    // Missing responses include legacy, frozen, and closing documents. Each is
    // treated as a live unknown build, so cleanup fails safe.
    if (!leasedBuildIds) return;

    const cacheNames = await caches.keys();

    // Close races with both activation and a newer install that began while
    // clients were answering the lease request. A cache created after the
    // snapshot above cannot be in the deletion set below.
    if (
      (await readActiveBuild()) !== currentBuildId ||
      self.registration.installing ||
      self.registration.waiting
    ) {
      return;
    }

    const retainedBuildIds = new Set([currentBuildId, ...leasedBuildIds]);
    const stalePrecaches = cacheNames.filter(
      (cacheName) =>
        cacheName.startsWith(appCachePrefix) &&
        cacheName.includes('-precache') &&
        ![...retainedBuildIds].some((leasedBuildId) =>
          isBuildPrecache(cacheName, leasedBuildId),
        ),
    );

    await Promise.all(stalePrecaches.map((cacheName) => caches.delete(cacheName)));
  };

  const scheduleReclamation = () => {
    if (!reclamationPromise) {
      reclamationPromise = reclaimUnleasedPrecaches().finally(() => {
        reclamationPromise = undefined;
      });
    }
    return reclamationPromise;
  };

  // Cache maintenance must never block activation or surface as an update
  // failure. If metadata storage is unavailable, the missing owner marker also
  // prevents every later deletion, so this fails closed.
  const scheduleReclamationSafely = () =>
    scheduleReclamation().catch(() => undefined);

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      writeActiveBuild()
        .then(() => scheduleReclamationSafely())
        .catch(() => undefined),
    );
  });

  self.addEventListener('message', (event) => {
    const data = event.data;
    if (
      data &&
      data.type === leaseReadyType &&
      typeof data.buildId === 'string' &&
      data.buildId.startsWith(appCachePrefix)
    ) {
      event.waitUntil(scheduleReclamationSafely());
    }
  });
})();
`;
}

export function createPwaCacheReclamationPlugin(
  options: PwaCacheReclamationPluginOptions,
): Plugin {
  const fileName = getPwaCacheReclamationScriptFileName(options.buildId);
  const source = createPwaCacheReclamationWorkerSource(options);

  return {
    name: `network-canvas-pwa-cache-reclamation-${options.appCachePrefix}`,
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
