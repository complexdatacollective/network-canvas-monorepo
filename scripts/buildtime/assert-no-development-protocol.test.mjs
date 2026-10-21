import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, it } from 'vitest';

import {
  assertNoDevelopmentProtocol,
  developmentProtocolMarkers,
  findDevelopmentProtocol,
} from './assert-no-development-protocol.mjs';

const protocolsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'protocols',
);
const developmentFile = (name) =>
  readFileSync(path.join(protocolsRoot, 'development', name));

const temporaryDirs = [];
const makeDist = (files) => {
  const dist = mkdtempSync(path.join(tmpdir(), 'dev-protocol-dist-'));
  temporaryDirs.push(dist);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dist, name)), { recursive: true });
    writeFileSync(path.join(dist, name), content);
  }
  return dist;
};

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('assertNoDevelopmentProtocol', () => {
  it('passes a build holding only the protocols the apps ship', () => {
    const dist = makeDist({
      'index.html': '<!doctype html><script src="/assets/main.js"></script>',
      'assets/main.js': `const sample = ${readFileSync(path.join(protocolsRoot, 'sample', 'protocol.json'), 'utf8')};`,
    });
    assert.deepEqual(findDevelopmentProtocol(dist), []);
    assert.doesNotThrow(() => assertNoDevelopmentProtocol(dist));
  });

  it('catches an emitted asset under any name', () => {
    const dist = makeDist({
      'assets/renamed-Ab12Cd34.jpg': developmentFile('assets/rubberduck.jpg'),
    });
    assert.deepEqual(findDevelopmentProtocol(dist), [
      'assets/renamed-Ab12Cd34.jpg is a copy of development/assets/rubberduck.jpg',
    ]);
    assert.throws(
      () => assertNoDevelopmentProtocol(dist),
      /the Development protocol is dev-only/,
    );
  });

  it('catches an asset inlined into a chunk as base64', () => {
    const base64 = developmentFile('assets/regions.geojson').toString('base64');
    const dist = makeDist({
      'assets/main.js': `export const url = "data:application/geo+json;base64,${base64}";`,
    });
    assert.deepEqual(findDevelopmentProtocol(dist), [
      'assets/main.js inlines development/assets/regions.geojson',
    ]);
  });

  it("catches the protocol's JSON, but not a sentence the app shares with it", () => {
    const protocol = developmentFile('protocol.json').toString('utf8');
    const [shared] = developmentProtocolMarkers();
    const dist = makeDist({
      'assets/chunk.js': `const p = JSON.parse(${JSON.stringify(JSON.stringify(JSON.parse(protocol)))});`,
      'assets/messages.js': `export const m = ${JSON.stringify(shared)};`,
    });
    const findings = findDevelopmentProtocol(dist);
    assert.equal(findings.length, 1);
    assert.match(
      findings[0],
      /^assets\/chunk\.js contains the Development protocol's JSON/,
    );
  });

  it('refuses to run when the protocol gives it too little to recognise', () => {
    const root = makeDist({
      'development/protocol.json': JSON.stringify({ name: 'Short' }),
      'development/assets/a.txt': 'asset',
      'sample/protocol.json': '{}',
      'templates/t/protocol.json': '{}',
    });
    assert.throws(
      () => findDevelopmentProtocol(makeDist({ 'a.js': '' }), root),
      /update the marker rule/,
    );
  });
});
