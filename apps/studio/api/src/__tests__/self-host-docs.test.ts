import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  RATE_LIMIT_SCOPES,
  RATE_LIMITS,
  type RateLimitRule,
  type RateLimitScope,
} from '../rate-limit/scopes.ts';

// The drift guard between the self-host guide's outbound-host table and the
// checked-in list beside it (#1909). The list is what #1897's no-outbound CI
// job allows, and the table is what an institution's firewall team reads: a
// host added to one and not the other is either a documented call the job
// blocks, or an allowed call nobody was told about. Neither is discoverable
// from the file that was changed.

const guideRoot = new URL('../../../docs/self-host/', import.meta.url);

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, guideRoot)), 'utf8');

const OUTBOUND_START = '<!-- outbound-hosts start -->';
const OUTBOUND_END = '<!-- outbound-hosts end -->';

/** Every non-comment, non-blank line of `outbound-hosts.txt`. */
function listedHosts(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * The first cell of every table row inside the marked block of
 * `requirements.md`. Delimited by markers rather than scanned for things that
 * look like hostnames, so the SMTP host — which is whatever `SMTP_URL` names,
 * and so has no fixed value to allow — can be discussed in the prose below the
 * table without joining the list.
 */
function documentedHosts(source: string): string[] {
  const start = source.indexOf(OUTBOUND_START);
  const end = source.indexOf(OUTBOUND_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `requirements.md must delimit its outbound-host table with ${OUTBOUND_START} and ${OUTBOUND_END}`,
    );
  }
  const section = source.slice(start + OUTBOUND_START.length, end);
  return [...section.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
    (match) => match[1]!,
  );
}

describe('the self-host guide’s outbound hosts', () => {
  const listed = listedHosts(read('outbound-hosts.txt'));
  const documented = documentedHosts(read('requirements.md'));

  it('names hosts at all in both files', () => {
    // Both readers above return an empty array for a file whose shape has
    // changed, and two empty arrays are equal. This is what stops the
    // comparison below passing because it compared nothing.
    expect(listed.length).toBeGreaterThan(0);
    expect(documented.length).toBeGreaterThan(0);
  });

  it('lists only hostnames', () => {
    const notHostnames = listed.filter(
      (host) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/.test(host),
    );
    expect(notHostnames).toEqual([]);
  });

  it('documents exactly the hosts the allowlist carries', () => {
    expect([...documented].sort()).toEqual([...listed].sort());
  });
});

// The same guard, for the rate limits: the constants in
// `src/rate-limit/scopes.ts` are what every deployment enforces, and the table
// in `requirements.md` is where a self-hoster reads them. Nothing generates one
// from the other, so a limit changed in code and not on the page is a guide
// that quietly describes a different instance from the one somebody is running
// — and unlike a variable they could check, a constant gives them no way to
// find out they were misled.

const RATE_LIMITS_START = '<!-- rate-limits start -->';
const RATE_LIMITS_END = '<!-- rate-limits end -->';

/**
 * `count/window` for one rule, in the largest unit that divides the window
 * whole — which is how the table is written, and how a person says it.
 */
function renderRule({ max, windowMs }: RateLimitRule): string {
  const units = [
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
  ] as const;
  const unit = units.find(([, size]) => windowMs % size === 0);
  if (!unit)
    throw new Error(`window of ${windowMs}ms is not a whole number of seconds`);
  return `${max}/${windowMs / unit[1]}${unit[0]}`;
}

/** The scope and limit cells of every row inside the marked block. */
function documentedLimits(source: string): [scope: string, limit: string][] {
  const start = source.indexOf(RATE_LIMITS_START);
  const end = source.indexOf(RATE_LIMITS_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `requirements.md must delimit its rate-limit table with ${RATE_LIMITS_START} and ${RATE_LIMITS_END}`,
    );
  }
  const section = source.slice(start + RATE_LIMITS_START.length, end);
  return [...section.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm)].map(
    (match) => [match[1]!, match[2]!],
  );
}

describe('the self-host guide’s rate limits', () => {
  const documented = documentedLimits(read('requirements.md'));

  it('has a table with rows in it', () => {
    // A reader that returns nothing — a renamed marker, a reshaped table —
    // would make both comparisons below compare two empty things and pass.
    expect(documented.length).toBeGreaterThan(0);
  });

  it('documents exactly the scopes the limiter has', () => {
    expect(documented.map(([scope]) => scope).sort()).toEqual(
      [...RATE_LIMIT_SCOPES].sort(),
    );
  });

  it('states the limit each scope is actually enforced at', () => {
    const wrong = documented.filter(
      ([scope, limit]) =>
        scope in RATE_LIMITS &&
        renderRule(RATE_LIMITS[scope as RateLimitScope]) !== limit,
    );
    expect(wrong).toEqual([]);
  });
});
