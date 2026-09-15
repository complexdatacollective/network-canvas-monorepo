import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
