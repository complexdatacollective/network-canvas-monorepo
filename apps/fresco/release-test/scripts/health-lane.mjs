#!/usr/bin/env node
// What `/api/health` tells an anonymous caller, and what it does not.
//
// The endpoint is unauthenticated so that load balancers and container
// runtimes can probe it, and a liveness probe needs nothing beyond the status.
// It deliberately reports no version and no uptime: the running version tells
// an anonymous caller which published vulnerabilities apply to this instance,
// and the uptime whether a fix has been deployed yet. A researcher still sees
// the version, on the dashboard, behind a session.
//
// The check that matters is the ABSENCE, and the release test previously
// asserted only that the endpoint answered 200 — which a build that had put
// the version back would have passed.
//
// Usage: node health-lane.mjs --lane <lane> [--expect-version <version>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  attempt,
  check,
  launch,
  newPage,
  recordDiagnosticsTo,
  report,
  signIn,
} from './fresco-driver.mjs';
import { lane } from './lanes.mjs';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'fresh');
const config = lane(laneName);
const outDir = argument(
  'out',
  join(import.meta.dirname, '..', 'artifacts', laneName),
);

/**
 * The version this instance is running.
 *
 * Taken from the build stamp when the caller does not pin one, because the
 * absence assertion needs something to look FOR: "the body does not contain
 * the version" is unfalsifiable without knowing what the version is.
 */
const expectedVersion =
  argument('expect-version', null) ??
  (() => {
    try {
      return JSON.parse(
        readFileSync(
          join(import.meta.dirname, '..', 'artifacts', 'stamp.json'),
          'utf8',
        ),
      ).version;
    } catch {
      return null;
    }
  })();

/** Detail keys the endpoint must not report, at any depth. */
const SUPPRESSED = [
  'version',
  'uptime',
  'nodeVersion',
  'node_version',
  'environment',
  'nodeEnv',
];

const keysIn = (value, depth = 0) => {
  if (depth > 6 || !value || typeof value !== 'object') return [];
  const found = [];
  if (!Array.isArray(value))
    for (const [key, entry] of Object.entries(value)) {
      found.push(key);
      found.push(...keysIn(entry, depth + 1));
    }
  else for (const entry of value) found.push(...keysIn(entry, depth + 1));
  return found;
};

const checks = [];
const result = { ok: false, checks, lane: laneName, expectedVersion };
let browser;

try {
  let body = null;
  let status = 0;
  checks.push(
    await attempt('health-answers-anonymously', async () => {
      const response = await fetch(`${config.baseUrl}/api/health`);
      status = response.status;
      body = await response.json();
      result.body = body;
      return {
        pass:
          status === 200 &&
          body?.status === 'healthy' &&
          Array.isArray(body?.checks) &&
          body.checks.length > 0,
        detail: `HTTP ${status}, status "${body?.status}", ${Array.isArray(body?.checks) ? body.checks.length : 0} check(s) reported`,
      };
    }),
  );

  // The headline behaviour. Both halves: no key that names a detail, and no
  // occurrence of the running version anywhere in the response text — a
  // version reported under a different key would satisfy the first alone.
  checks.push(
    await attempt('health-hides-deployment-details', async () => {
      if (body === null)
        return { pass: false, detail: 'the endpoint returned nothing to read' };
      const leaked = keysIn(body).filter((key) => SUPPRESSED.includes(key));
      const text = JSON.stringify(body);
      const versionLeak = Boolean(
        expectedVersion && text.includes(expectedVersion),
      );
      return {
        pass: leaked.length === 0 && !versionLeak && Boolean(expectedVersion),
        detail: !expectedVersion
          ? 'no version was pinned or stamped, so "the version is absent" could not be checked'
          : leaked.length > 0
            ? `the response reports ${[...new Set(leaked)].join(', ')} to an anonymous caller`
            : versionLeak
              ? `the response carries the running version (${expectedVersion})`
              : `no detail keys (${SUPPRESSED.join(', ')}) and no occurrence of version ${expectedVersion}`,
      };
    }),
  );

  // And the counterpart, so this is a rule about WHO may learn the version
  // rather than about nobody: a signed-in researcher still reads it on the
  // dashboard.
  const launched = await launch({ lane: laneName });
  browser = launched.browser;
  const page = await newPage(launched.context);
  recordDiagnosticsTo(page, outDir);
  checks.push(
    await attempt('health-version-still-shown-to-researchers', async () => {
      await signIn(page, { lane: laneName });
      await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
      await page.goto(`${config.baseUrl}/dashboard/settings`, {
        waitUntil: 'networkidle',
      });
      const section = await page
        .getByText(/You are currently running Fresco/)
        .first()
        .textContent()
        .catch(() => null);
      return {
        pass: Boolean(
          expectedVersion && section && section.includes(expectedVersion),
        ),
        detail: section
          ? `the settings page says: ${section.trim()}`
          : 'the settings page did not report a running version to a signed-in researcher',
      };
    }),
  );
  result.ok = true;
} catch (error) {
  result.error = error.message;
  checks.push(check('health-lane-completed', false, error.message));
} finally {
  await browser?.close().catch(() => {});
}

report(result);
