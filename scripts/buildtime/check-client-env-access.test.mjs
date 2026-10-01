import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-client-env-access.mjs');
const REPO_ROOT = resolve(scriptDir, '..', '..');

const ENV_MODULE = `
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string(),
    UPLOADTHING_TOKEN: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_THING: z.string(),
  },
  shared: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SANDBOX_MODE: z.stringbool().optional(),
    APP_VERSION: z.string().optional(),
  },
  runtimeEnv: {},
});
`;

const NEXT_CONFIG = `
const config = {
  reactStrictMode: true,
  env: {
    APP_VERSION: 'v1',
    COMMIT_HASH: 'abc',
  },
};
export default config;
`;

/** A throwaway git repository holding one app with `files` under apps/<app>/. */
function fixture(
  files,
  { app = 'thing', env = ENV_MODULE, nextConfig = NEXT_CONFIG } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), 'client-env-guard-'));
  execFileSync('git', ['init', '-q'], { cwd });
  const write = (name, body) => {
    mkdirSync(dirname(join(cwd, name)), { recursive: true });
    writeFileSync(join(cwd, name), body);
  };
  if (env !== null) write(`apps/${app}/env.js`, env);
  if (nextConfig !== null) write(`apps/${app}/next.config.ts`, nextConfig);
  for (const [name, body] of Object.entries(files))
    write(`apps/${app}/${name}`, body);
  return cwd;
}

const run = (cwd) =>
  spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });

const clientComponent = (body) => `'use client';

import { env } from '~/env';

export default function Thing() {
  ${body}
}
`;

test('flags a server-only variable read in a client module', () => {
  const cwd = fixture({
    'components/Badge.tsx': clientComponent(
      'if (!env.SANDBOX_MODE) return null;\n  return <footer />;',
    ),
  });
  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /components\/Badge\.tsx:\d+: `env\.SANDBOX_MODE`/,
  );
  assert.match(result.stderr, /does not expose it to the browser/);
});

test('flags a server-block variable too', () => {
  const cwd = fixture({
    'components/Upload.tsx': clientComponent(
      'return <p>{env.UPLOADTHING_TOKEN}</p>;',
    ),
  });

  assert.equal(run(cwd).status, 1);
});

test('allows NODE_ENV, which every bundler inlines', () => {
  const cwd = fixture({
    'components/Debug.tsx': clientComponent(
      "return env.NODE_ENV === 'development' ? <p /> : null;",
    ),
  });
  const result = run(cwd);

  assert.equal(result.status, 0, result.stderr);
});

test('allows a variable next.config inlines into the browser bundle', () => {
  const cwd = fixture({
    'components/Version.tsx': clientComponent(
      'return <p>{env.APP_VERSION}</p>;',
    ),
  });

  assert.equal(run(cwd).status, 0);
});

test('stops allowing it once next.config no longer inlines it', () => {
  const cwd = fixture(
    {
      'components/Version.tsx': clientComponent(
        'return <p>{env.APP_VERSION}</p>;',
      ),
    },
    { nextConfig: 'export default { reactStrictMode: true };\n' },
  );

  assert.equal(run(cwd).status, 1);
});

test('allows a NEXT_PUBLIC_ variable', () => {
  const cwd = fixture({
    'components/Search.tsx': clientComponent(
      'return <p>{env.NEXT_PUBLIC_THING}</p>;',
    ),
  });

  assert.equal(run(cwd).status, 0);
});

test('ignores the same read in a server module', () => {
  const cwd = fixture({
    'app/layout.tsx': `import { env } from '~/env';

export default function Layout() {
  return env.SANDBOX_MODE ? <footer /> : null;
}
`,
  });

  assert.equal(run(cwd).status, 0);
});

test('sees through a leading comment and a renamed import', () => {
  const cwd = fixture({
    'components/Badge.tsx': `// A banner shown only on the sandbox.
'use client';

import { env as config } from '~/env';

export default function Badge() {
  return config.SANDBOX_MODE ? <footer /> : null;
}
`,
  });

  assert.equal(run(cwd).status, 1);
});

test('ignores an unrelated binding that merely ends in env', () => {
  const cwd = fixture({
    'components/Other.tsx': `'use client';

import { environment } from '~/elsewhere';

export default function Other() {
  return environment.SANDBOX_MODE ? <footer /> : null;
}
`,
  });

  assert.equal(run(cwd).status, 0);
});

test("ignores an `env` imported from somewhere other than the app's own module", () => {
  // The allowlist is derived from `apps/<app>/env.js`, so the guard makes no
  // claim about an unrelated package that happens to export `env`.
  const cwd = fixture({
    'components/Other.tsx': `'use client';

import { env } from 'some-library';

export default function Other() {
  return env.SANDBOX_MODE ? <footer /> : null;
}
`,
  });

  assert.equal(run(cwd).status, 0);
});

test('refuses an env module whose server block it cannot read', () => {
  const cwd = fixture({}, { env: 'export const env = {};\n' });
  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /no `server:` block found/);
});

test('passes on this repository', () => {
  const result = run(REPO_ROOT);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
