import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { determineChunkIdFromSource } from '@posthog/plugin-utils';

const script = new URL('./posthog-cli-upload-stub.mjs', import.meta.url);

test('offline processing registers provider chunk IDs in real JS, MJS and CJS output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'posthog-processing-fixture-'));
  try {
    for (const extension of ['js', 'mjs', 'cjs']) {
      const chunk = join(directory, `fixture.${extension}`);
      writeFileSync(
        chunk,
        '#!/usr/bin/env node\n"use strict";\nglobalThis.fixtureStrict = (function () { return this; })() === undefined;',
      );
      writeFileSync(
        `${chunk}.map`,
        JSON.stringify({
          version: 3,
          sources: ['fixture.ts'],
          names: [],
          mappings: '',
        }),
      );
    }
    const result = spawnSync(
      process.execPath,
      [
        script.pathname,
        'sourcemap',
        'process',
        '--directory',
        directory,
        '--delete-after',
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        // No API credentials or host are inherited. The provider utilities are
        // pure local code; this stub never invokes the downloadable CLI wrapper.
        env: { PATH: process.env.PATH },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const ids = new Set();
    for (const extension of ['js', 'mjs', 'cjs']) {
      const chunk = join(directory, `fixture.${extension}`);
      const code = readFileSync(chunk, 'utf8');
      const id = determineChunkIdFromSource(code);
      assert.match(
        id ?? '',
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
      );
      ids.add(id);
      const runtime = {};
      runInNewContext(code, runtime, { filename: chunk });
      assert.equal(
        runtime.fixtureStrict,
        true,
        'injection must preserve a directive prologue',
      );
      const registered = Object.entries(runtime._posthogChunkIds ?? {});
      assert.equal(
        registered.length,
        1,
        'a real executing chunk must register its stack',
      );
      assert.equal(registered[0][1], id);
      assert(registered[0][0].includes(chunk));
      assert.throws(() => readFileSync(`${chunk}.map`), { code: 'ENOENT' });
    }
    assert.equal(ids.size, 3, 'each compiled file needs its own source-map ID');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
