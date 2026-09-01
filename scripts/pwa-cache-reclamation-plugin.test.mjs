import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import {
  PWA_BUILD_LEASE_READY,
  PWA_BUILD_LEASE_REQUEST,
  PWA_BUILD_LEASE_RESPONSE,
} from '../packages/fresco-ui/src/appUpdate/pwaBuildLeaseMessages.ts';
import {
  createPwaCacheReclamationWorkerSource,
  getPwaCacheReclamationScriptFileName,
  matchRetainedPwaAsset,
} from './pwa-cache-reclamation-plugin.ts';

const APP_PREFIX = 'architect-';
const CURRENT_BUILD = 'architect-8.2.0-turbo-current';
const OLD_BUILD = 'architect-8.1.0-turbo-old';
const STALE_BUILD = 'architect-8.0.0-turbo-stale';
const cacheName = (buildId) => `${buildId}-precache-v2-scope`;

async function withTemporaryGlobals(properties, run) {
  const descriptors = new Map(
    Object.keys(properties).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  try {
    for (const [name, value] of Object.entries(properties)) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value,
        writable: true,
      });
    }
    await run();
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete globalThis[name];
      }
    }
  }
}

function createCacheStorage(initialNames, { metadataWriteFails = false } = {}) {
  const names = [...initialNames];
  const entries = new Map();
  const deleted = [];

  return {
    deleted,
    entries,
    async delete(name) {
      deleted.push(name);
      const index = names.indexOf(name);
      if (index >= 0) names.splice(index, 1);
      return index >= 0;
    },
    async keys() {
      return [...names];
    },
    async open(name) {
      if (!names.includes(name)) names.push(name);
      return {
        async match(key) {
          return entries.get(`${name}:${String(key)}`)?.clone();
        },
        async put(key, response) {
          if (metadataWriteFails && name.endsWith('pwa-cache-metadata')) {
            throw new Error('quota exceeded');
          }
          entries.set(`${name}:${String(key)}`, response.clone());
        },
      };
    },
  };
}

function createWorkerHarness({
  cacheNames,
  clients,
  metadataWriteFails = false,
  waiting = null,
}) {
  const listeners = new Map();
  const caches = createCacheStorage(cacheNames, { metadataWriteFails });
  const self = {
    registration: {
      scope: 'https://architect.example/',
      installing: null,
      waiting,
    },
    clients: {
      async matchAll() {
        return clients;
      },
    },
    addEventListener(type, listener) {
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };

  const dispatch = (type, event) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };

  for (const client of clients) {
    client.postMessage = (message) => {
      if (message.type !== PWA_BUILD_LEASE_REQUEST || !client.buildId) return;
      queueMicrotask(() => {
        dispatch('message', {
          data: {
            type: PWA_BUILD_LEASE_RESPONSE,
            requestId: message.requestId,
            buildId: client.buildId,
          },
          source: client,
          waitUntil() {},
        });
      });
    };
  }

  const source = createPwaCacheReclamationWorkerSource({
    appCachePrefix: APP_PREFIX,
    buildId: CURRENT_BUILD,
    responseTimeoutMs: 5,
  });
  vm.runInNewContext(source, {
    URL,
    Response,
    caches,
    clearTimeout,
    crypto,
    queueMicrotask,
    self,
    setTimeout,
  });

  const dispatchExtendable = async (type, data) => {
    const promises = [];
    dispatch(type, {
      data,
      waitUntil(promise) {
        promises.push(promise);
      },
    });
    await Promise.all(promises);
  };

  return { caches, dispatchExtendable, self };
}

const modernClient = (id, buildId) => ({
  id,
  buildId,
  url: `https://architect.example/client/${id}`,
  postMessage() {},
});

describe('retained PWA asset handler', () => {
  it('returns an exact cached response without reaching the network', async () => {
    const request = new Request(
      'https://architect.example/assets/old-chunk-hash.js',
    );
    let matchedRequest;
    let fetchCalled = false;

    await withTemporaryGlobals(
      {
        caches: {
          async match(candidate) {
            matchedRequest = candidate;
            return new Response('cached old bundle');
          },
        },
        async fetch() {
          fetchCalled = true;
          return new Response('network');
        },
      },
      async () => {
        const response = await matchRetainedPwaAsset({ request });
        assert.equal(await response.text(), 'cached old bundle');
      },
    );

    assert.equal(matchedRequest, request);
    assert.equal(fetchCalled, false);
  });

  it('falls back to the network when CacheStorage is not available', async () => {
    const request = new Request(
      'https://interviewer.example/assets/current-chunk-hash.css',
    );
    let fetchedRequest;

    await withTemporaryGlobals(
      {
        caches: undefined,
        async fetch(candidate) {
          fetchedRequest = candidate;
          return new Response('network fallback');
        },
      },
      async () => {
        const response = await matchRetainedPwaAsset({ request });
        assert.equal(await response.text(), 'network fallback');
      },
    );

    assert.equal(fetchedRequest, request);
  });
});

describe('PWA cache reclamation worker', () => {
  it('keeps every leased build and deletes only unleased app precaches', async () => {
    const harness = createWorkerHarness({
      cacheNames: [
        cacheName(CURRENT_BUILD),
        cacheName(OLD_BUILD),
        cacheName(STALE_BUILD),
        'architect-images',
        'unrelated-precache-v2-scope',
      ],
      clients: [
        modernClient('current-tab', CURRENT_BUILD),
        modernClient('old-editor-tab', OLD_BUILD),
      ],
    });

    await harness.dispatchExtendable('activate');
    await harness.dispatchExtendable('message', {
      type: PWA_BUILD_LEASE_READY,
      buildId: CURRENT_BUILD,
    });

    assert.deepEqual(harness.caches.deleted, [cacheName(STALE_BUILD)]);
  });

  it('reclaims a build only after its last tab releases the lease', async () => {
    const clients = [
      modernClient('current-tab', CURRENT_BUILD),
      modernClient('old-editor-tab', OLD_BUILD),
    ];
    const harness = createWorkerHarness({
      cacheNames: [cacheName(CURRENT_BUILD), cacheName(OLD_BUILD)],
      clients,
    });

    await harness.dispatchExtendable('activate');
    assert.deepEqual(harness.caches.deleted, []);

    clients.splice(1, 1);
    await harness.dispatchExtendable('message', {
      type: PWA_BUILD_LEASE_READY,
      buildId: CURRENT_BUILD,
    });

    assert.deepEqual(harness.caches.deleted, [cacheName(OLD_BUILD)]);
  });

  it('fails safe when any scoped tab does not answer the lease request', async () => {
    const harness = createWorkerHarness({
      cacheNames: [cacheName(CURRENT_BUILD), cacheName(STALE_BUILD)],
      clients: [
        modernClient('current-tab', CURRENT_BUILD),
        modernClient('legacy-tab', undefined),
      ],
    });

    await harness.dispatchExtendable('activate');
    await harness.dispatchExtendable('message', {
      type: PWA_BUILD_LEASE_READY,
      buildId: CURRENT_BUILD,
    });

    assert.deepEqual(harness.caches.deleted, []);
  });

  it('does not reclaim while a newer worker is installing or waiting', async () => {
    const harness = createWorkerHarness({
      cacheNames: [cacheName(CURRENT_BUILD), cacheName(STALE_BUILD)],
      clients: [modernClient('current-tab', CURRENT_BUILD)],
      waiting: { scriptURL: '/sw.js' },
    });

    await harness.dispatchExtendable('activate');
    await harness.dispatchExtendable('message', {
      type: PWA_BUILD_LEASE_READY,
      buildId: CURRENT_BUILD,
    });

    assert.deepEqual(harness.caches.deleted, []);
  });

  it('does not let a superseded worker delete the active build cache', async () => {
    const clients = [modernClient('legacy-tab', undefined)];
    const harness = createWorkerHarness({
      cacheNames: [cacheName(CURRENT_BUILD), cacheName(STALE_BUILD)],
      clients,
    });
    await harness.dispatchExtendable('activate');

    const metadata = await harness.caches.open(
      `${APP_PREFIX}pwa-cache-metadata`,
    );
    await metadata.put(
      'https://architect.example/__pwa-active-build__',
      new Response('architect-8.3.0-turbo-newer'),
    );
    clients[0].buildId = CURRENT_BUILD;
    await harness.dispatchExtendable('message', {
      type: PWA_BUILD_LEASE_READY,
      buildId: CURRENT_BUILD,
    });

    assert.deepEqual(harness.caches.deleted, []);
  });

  it('allows activation but disables cleanup when metadata cannot be stored', async () => {
    const harness = createWorkerHarness({
      cacheNames: [cacheName(CURRENT_BUILD), cacheName(STALE_BUILD)],
      clients: [modernClient('current-tab', CURRENT_BUILD)],
      metadataWriteFails: true,
    });

    await assert.doesNotReject(() => harness.dispatchExtendable('activate'));
    await harness.dispatchExtendable('message', {
      type: PWA_BUILD_LEASE_READY,
      buildId: CURRENT_BUILD,
    });

    assert.deepEqual(harness.caches.deleted, []);
  });

  it('rejects unsafe build IDs before using them as emitted file names', () => {
    assert.equal(
      getPwaCacheReclamationScriptFileName(CURRENT_BUILD),
      `pwa-cache-reclamation-${CURRENT_BUILD}.js`,
    );
    assert.throws(
      () => getPwaCacheReclamationScriptFileName('../outside'),
      /Invalid PWA build ID/,
    );
    assert.throws(
      () =>
        createPwaCacheReclamationWorkerSource({
          appCachePrefix: APP_PREFIX,
          buildId: CURRENT_BUILD,
          responseTimeoutMs: 0,
        }),
      /response timeout must be a positive integer/,
    );
  });
});
