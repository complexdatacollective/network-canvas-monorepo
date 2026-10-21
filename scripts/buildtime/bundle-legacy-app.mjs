// Puts an app's pinned older-major build into dist/v8. Run by the app's
// build.mjs after Vite has built it and generated its service worker, so
// nothing here can enter the newer app's precache, and before its
// assert-pwa-build.mjs, which checks the result. See legacy-app.ts for the pin
// and the environment.
//
// The tarball comes from, in order (names for app `interviewer`):
//   1. INTERVIEWER_LEGACY_V8_TARBALL, a local file (for offline or proxied
//      builds, and for testing an unreleased build);
//   2. apps/interviewer/node_modules/.cache/interviewer-legacy/<sha256>.tgz,
//      from an earlier build;
//   3. the pinned URL, downloaded with retries and then cached.
// Whichever it is must hash to the pinned sha256. It is listed before it is
// extracted, so an entry that would land outside the extraction directory or
// is not a plain file or directory refuses the build instead of being written.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import {
  findLegacyAppHostingFiles,
  LEGACY_APP_DIST_DIR,
  validateLegacyAppDist,
} from './legacy-app.ts';

const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

const DEFAULT_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * @param {{
 *   app: import('./legacy-app.ts').LegacyApp,
 *   pin: import('./legacy-app.ts').LegacyAppPin,
 *   cacheDir: string,
 *   env: Record<string, string | undefined>,
 *   fetchImpl: typeof fetch,
 *   attempts: number,
 *   timeoutMs: number,
 *   retryDelayMs: number,
 *   log: (message: string) => void,
 * }} options
 * @returns {Promise<string>} the path of a verified tarball
 */
const obtainTarball = async ({
  app,
  pin,
  cacheDir,
  env,
  fetchImpl,
  attempts,
  timeoutMs,
  retryDelayMs,
  log,
}) => {
  const overrideName = app.env.tarball;
  const override = env[overrideName]?.trim();
  if (override) {
    const path = resolve(override);
    if (!existsSync(path)) {
      throw new Error(`${overrideName} names ${path}, which does not exist.`);
    }
    const actual = sha256Of(readFileSync(path));
    if (actual !== pin.sha256) {
      throw new Error(
        `${overrideName} (${path}) hashes to ${actual}, but the pin is ${pin.sha256}.`,
      );
    }
    log(`using ${overrideName} ${path}`);
    return path;
  }

  const cached = join(cacheDir, `${pin.sha256}.tgz`);
  if (existsSync(cached)) {
    if (sha256Of(readFileSync(cached)) === pin.sha256) {
      log(`using cached ${cached}`);
      return cached;
    }
    rmSync(cached, { force: true });
  }

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(pin.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText}`.trim(),
        );
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = sha256Of(bytes);
      if (actual !== pin.sha256) {
        // A complete download that hashes wrong is not a network blip: the
        // asset was replaced or the pin is wrong. Never retry into it.
        const mismatch = new Error(
          `${pin.url} hashes to ${actual}, but the pin is ${pin.sha256}. The release asset was replaced, or the pin is wrong.`,
        );
        mismatch.final = true;
        throw mismatch;
      }
      mkdirSync(cacheDir, { recursive: true });
      const partial = `${cached}.${process.pid}.partial`;
      writeFileSync(partial, bytes);
      renameSync(partial, cached);
      log(`downloaded ${pin.url}`);
      return cached;
    } catch (error) {
      if (error?.final) throw error;
      lastError = error;
      log(
        `download attempt ${attempt} of ${attempts} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt < attempts && retryDelayMs > 0) {
        await new Promise((done) => setTimeout(done, retryDelayMs * attempt));
      }
    }
  }
  throw new Error(
    `could not download ${pin.url} after ${attempts} attempts (${lastError instanceof Error ? lastError.message : String(lastError)}). Set ${overrideName} to a local copy, or ${app.env.skip}=true outside a release build.`,
  );
};

const runTar = (args) => {
  const result = spawnSync('tar', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `tar ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`,
    );
  }
  return result.stdout;
};

/**
 * Refuse an archive that would write outside its extraction directory or
 * create anything but plain files and directories (links, devices, FIFOs).
 */
const assertSafeArchive = (app, tarball) => {
  const names = runTar(['-tzf', tarball]).split('\n').filter(Boolean);
  for (const name of names) {
    if (isAbsolute(name) || name.split('/').includes('..')) {
      throw new Error(`the ${app.label} tarball has an unsafe entry: ${name}`);
    }
  }
  const listing = runTar(['-tvzf', tarball]).split('\n').filter(Boolean);
  for (const line of listing) {
    if (line[0] !== '-' && line[0] !== 'd') {
      throw new Error(
        `the ${app.label} tarball has an entry that is not a file or directory: ${line}`,
      );
    }
  }
};

/**
 * Verify, extract, validate and install the app's pinned older-major build
 * into `<dist>/v8`. Does nothing (and returns null) when `pin` is null.
 *
 * @param {{
 *   app: import('./legacy-app.ts').LegacyApp,
 *   appRoot: string,
 *   dist: string,
 *   pin: import('./legacy-app.ts').LegacyAppPin | null,
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   attempts?: number,
 *   timeoutMs?: number,
 *   retryDelayMs?: number,
 *   log?: (message: string) => void,
 * }} options
 * @returns {Promise<string | null>} the installed directory
 */
export const bundleLegacyApp = async ({
  app,
  appRoot,
  dist,
  pin,
  env = process.env,
  fetchImpl = fetch,
  attempts = DEFAULT_ATTEMPTS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryDelayMs = 2_000,
  log = (message) => console.log(`[legacy-${app.name}] ${message}`),
}) => {
  const target = join(dist, LEGACY_APP_DIST_DIR);
  if (pin === null) {
    log(`${app.label} is not bundled into this build.`);
    return null;
  }

  // Extraction happens beside the download cache, inside the app, so the
  // final move into dist is a rename on one filesystem.
  const cacheDir = join(appRoot, 'node_modules', '.cache', app.cacheDirName);
  const tarball = await obtainTarball({
    app,
    pin,
    cacheDir,
    env,
    fetchImpl,
    attempts,
    timeoutMs,
    retryDelayMs,
    log,
  });

  mkdirSync(cacheDir, { recursive: true });
  const work = mkdtempSync(join(cacheDir, 'extract-'));
  try {
    assertSafeArchive(app, tarball);
    runTar(['-xzf', tarball, '-C', work, '--no-same-owner']);
    validateLegacyAppDist(app, work, pin);

    for (const file of findLegacyAppHostingFiles(work)) {
      rmSync(join(work, file), { force: true });
    }

    rmSync(target, { recursive: true, force: true });
    try {
      renameSync(work, target);
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      cpSync(work, target, { recursive: true });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  log(`bundled ${app.appLabel} ${pin.version} into ${target}`);
  return target;
};
