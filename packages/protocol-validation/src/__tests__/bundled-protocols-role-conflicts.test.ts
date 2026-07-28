import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { findVariableRoleConflicts } from '../utils/findVariableRoleConflicts.ts';

// packages/protocols is a pure-data package with no test runner, so (like
// all-interfaces-fixture.test.ts) this test reads the bundled protocol.json
// files directly by relative path instead of adding a dependency for a
// static-file read. Discover every bundled protocol.json under
// packages/protocols/ rather than hard-coding paths, so a newly added
// template or fixture is covered automatically.
const protocolsRoot = path.resolve(import.meta.dirname, '../../../protocols');

const discoverProtocolFiles = (root: string): string[] =>
  readdirSync(root, { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string')
    .filter((entry) => path.basename(entry) === 'protocol.json')
    .map((entry) => path.join(root, entry))
    .sort();

const protocolFiles = discoverProtocolFiles(protocolsRoot);

describe('bundled protocols are free of variable role conflicts', () => {
  it('discovered at least one bundled protocol.json', () => {
    expect(protocolFiles.length).toBeGreaterThan(0);
  });

  it.each(protocolFiles)('%s has no conflicts', (protocolFile) => {
    const raw = readFileSync(protocolFile, 'utf8');
    const protocol: unknown = JSON.parse(raw);
    const conflicts = findVariableRoleConflicts(protocol);
    expect(conflicts, JSON.stringify(conflicts, null, 2)).toEqual([]);
  });
});
