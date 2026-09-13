import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const studioRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const execFileAsync = promisify(execFile);

describe('production recovery entrypoints', () => {
  it.each([
    ['recovery:reconcile-authorization', 'dist/recovery-authorization.js'],
    ['recovery:authorize-current', 'dist/recovery-authorize-current.js'],
  ])('dispatches %s to the bundled command', async (command, bundledEntry) => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-entrypoint-'));
    const fakeNode = join(directory, 'node');
    await writeFile(fakeNode, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n', {
      mode: 0o755,
    });
    try {
      const result = await execFileAsync(
        '/bin/sh',
        ['./docker-entrypoint.sh', command],
        {
          cwd: studioRoot,
          env: { PATH: `${directory}:${process.env.PATH ?? ''}` },
        },
      );
      expect(result.stdout.trim()).toBe(bundledEntry);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['recovery-authorization.ts', 'recovery-authorize-current.ts'])(
    '%s keeps the receipt as the only stdout record',
    async (filename) => {
      const source = await readFile(
        fileURLToPath(new URL(`../../${filename}`, import.meta.url)),
        'utf8',
      );
      expect(source).toContain('createOperationalLogger(process.stderr)');
      expect(source).not.toMatch(/import \{ logOperational \}/);
    },
  );
});
