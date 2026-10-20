import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, it } from 'vitest';

import { findShippedProtocols } from './find-shipped-protocols.mjs';

const DESCRIPTION =
  'A protocol for testing that a production build leaves this one out entirely';
const VIDEO = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
const CSV = 'name,age\nAlex,30\n';
const SVG = "<svg xmlns='http://www.w3.org/2000/svg'/>";

describe('findShippedProtocols', () => {
  let root;
  let protocolsRoot;
  let dist;

  const writeDist = (file, data) => {
    mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
    writeFileSync(path.join(dist, file), data);
  };
  const find = () =>
    findShippedProtocols({
      dist,
      protocolsRoot,
      protocolDirs: ['development'],
    });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'find-shipped-protocols-'));
    protocolsRoot = path.join(root, 'packages', 'protocols');
    const assets = path.join(protocolsRoot, 'development', 'assets');
    mkdirSync(assets, { recursive: true });
    writeFileSync(
      path.join(protocolsRoot, 'development', 'protocol.json'),
      JSON.stringify({ name: 'Development', description: DESCRIPTION }),
    );
    writeFileSync(path.join(assets, 'withSound.mp4'), VIDEO);
    writeFileSync(path.join(assets, 'people.csv'), CSV);
    writeFileSync(path.join(assets, 'quadrant.svg'), SVG);
    writeFileSync(path.join(assets, '.gitkeep'), '');

    dist = path.join(root, 'dist');
    writeDist('index.html', '<!doctype html>');
    writeDist('assets/main-abc.js', 'export const app = "editor";');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds nothing in a build that carries none of the protocol', async () => {
    assert.deepEqual(await find(), []);
  });

  it('finds an emitted media file under any name', async () => {
    writeDist('assets/withSound-Hash123.mp4', VIDEO);
    assert.deepEqual(await find(), [
      'assets/withSound-Hash123.mp4 (development/assets/withSound.mp4)',
    ]);
  });

  it('finds media inlined into a script as base64', async () => {
    writeDist(
      'assets/main-abc.js',
      `const a = "data:text/csv;base64,${Buffer.from(CSV).toString('base64')}";`,
    );
    assert.deepEqual(await find(), [
      'assets/main-abc.js inlines development/assets/people.csv',
    ]);
  });

  it('finds a glob keyed by the protocol source path', async () => {
    writeDist(
      'assets/main-abc.js',
      `const a = {"../../packages/protocols/development/assets/quadrant.svg": "data:image/svg+xml,%3csvg"};`,
    );
    assert.deepEqual(await find(), [
      'assets/main-abc.js references packages/protocols/development/',
    ]);
  });

  it('finds the protocol JSON', async () => {
    writeDist(
      'assets/dev-xyz.js',
      `const p = {description: "${DESCRIPTION}"};`,
    );
    assert.deepEqual(await find(), [
      'assets/dev-xyz.js contains development/protocol.json',
    ]);
  });
});
