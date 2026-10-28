import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createLegacyAppDevPlugin,
  prepareLegacyAppForDev,
} from './legacy-app-dev-plugin.ts';
import {
  fixturePin,
  legacyDistFiles,
  writeFiles,
} from './legacy-app-fixture.mjs';
import { legacyApp } from './legacy-app.ts';

const app = legacyApp('interviewer');

let work;
let server;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'legacy-dev-'));
});

afterEach(async () => {
  await new Promise((done) => (server ? server.close(done) : done()));
  server = undefined;
  rmSync(work, { recursive: true, force: true });
});

/**
 * Serve `legacyRoot` through the plugin's middleware, with a fallback that
 * stands in for Vite's own middleware. Returns the server's origin.
 */
const serve = async (legacyRoot) => {
  const handlers = [];
  createLegacyAppDevPlugin(app, legacyRoot).configureServer({
    middlewares: { use: (handler) => handlers.push(handler) },
  });
  server = createServer((req, res) => {
    const fallback = () => {
      res.statusCode = 200;
      res.end('this app');
    };
    const [handler] = handlers;
    if (handler) handler(req, res, fallback);
    else fallback();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${server.address().port}`;
};

const legacyRootWith = (files) => {
  const legacyRoot = join(work, 'v8');
  writeFiles(legacyRoot, files);
  return legacyRoot;
};

describe('createLegacyAppDevPlugin', () => {
  it('serves the older major’s files under /v8/, with their types', async () => {
    const origin = await serve(
      legacyRootWith({
        'index.html': '<p>Interviewer 8</p>',
        'assets/main.js': 'export {};',
        'manifest.webmanifest': '{}',
      }),
    );

    const script = await fetch(`${origin}/v8/assets/main.js`);
    expect(script.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(await script.text()).toBe('export {};');
    expect(
      (await fetch(`${origin}/v8/manifest.webmanifest`)).headers.get(
        'content-type',
      ),
    ).toBe('application/manifest+json');
  });

  it('answers a deep link under /v8/ with the older major’s shell', async () => {
    const origin = await serve(
      legacyRootWith({ 'index.html': '<p>Interviewer 8</p>' }),
    );

    for (const path of ['/v8/', '/v8/interview/abc?mode=review']) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<p>Interviewer 8</p>');
    }
  });

  it('redirects /v8 to /v8/, keeping the query', async () => {
    const origin = await serve(
      legacyRootWith({ 'index.html': '<p>Interviewer 8</p>' }),
    );

    const response = await fetch(`${origin}/v8?x=1`, { redirect: 'manual' });
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/v8/?x=1');
  });

  it('never serves a file outside the older major’s directory', async () => {
    writeFileSync(join(work, 'secret.txt'), 'secret');
    const origin = await serve(
      legacyRootWith({ 'index.html': '<p>Interviewer 8</p>' }),
    );

    for (const path of ['/v8/..%2fsecret.txt', '/v8/%2e%2e%2fsecret.txt']) {
      expect(await (await fetch(`${origin}${path}`)).text()).toBe(
        '<p>Interviewer 8</p>',
      );
    }
  });

  it('refuses the older major’s service worker, so none outlives the dev server', async () => {
    const origin = await serve(
      legacyRootWith({
        'index.html': '<p>Interviewer 8</p>',
        'sw.js': 'self.skipWaiting();',
      }),
    );

    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`${origin}/v8/sw.js?x=1`, { method });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  });

  it('leaves every other address to this app', async () => {
    const origin = await serve(
      legacyRootWith({ 'index.html': '<p>Interviewer 8</p>' }),
    );

    expect(await (await fetch(`${origin}/interview/abc`)).text()).toBe(
      'this app',
    );
  });

  it('does nothing without a prepared build', async () => {
    const origin = await serve(null);

    expect(await (await fetch(`${origin}/v8/`)).text()).toBe('this app');
  });
});

describe('prepareLegacyAppForDev', () => {
  it('prepares nothing when the build is not pinned or is skipped', async () => {
    for (const reason of ['unpinned', 'skipped']) {
      expect(
        await prepareLegacyAppForDev({
          app,
          appRoot: work,
          resolution: { bundled: false, pin: null, reason },
        }),
      ).toBeNull();
    }
  });

  it('reuses the build already extracted for this pin', async () => {
    const pin = fixturePin(app);
    const legacyRoot = join(
      work,
      'node_modules',
      '.cache',
      app.cacheDirName,
      `dev-${pin.sha256}`,
      'v8',
    );
    writeFiles(legacyRoot, legacyDistFiles(app));

    expect(
      await prepareLegacyAppForDev({
        app,
        appRoot: work,
        resolution: { bundled: true, pin },
      }),
    ).toBe(legacyRoot);
  });

  it('runs without the older major, saying why, when its build cannot be obtained', async () => {
    const messages = [];
    const pin = fixturePin(app);

    expect(
      await prepareLegacyAppForDev({
        app,
        appRoot: work,
        resolution: { bundled: true, pin },
        // A local tarball that does not exist: no download is attempted.
        env: { [app.env.tarball]: join(work, 'missing.tgz') },
        log: (message) => messages.push(message),
      }),
    ).toBeNull();
    expect(messages.join('\n')).toMatch(/runs without Interviewer 8/);
  });
});
