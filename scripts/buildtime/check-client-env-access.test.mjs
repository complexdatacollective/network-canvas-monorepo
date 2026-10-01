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

const clientComponent = (body, specifier = '~/env') => `'use client';

import { env } from '${specifier}';

export default function Thing() {
  ${body}
}
`;

test('flags a variable the browser is not given', () => {
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

test('flags it however the env module declares it — quoted key', () => {
  // The first version of this guard derived the GUARDED names from `env.js`,
  // and its property matcher skipped quoted keys, so this read passed
  // silently. The allowlist design cannot miss a declaration because it never
  // reads one.
  const cwd = fixture(
    {
      'components/Leak.tsx': clientComponent(
        'return <p>{env.SECRET_TOKEN}</p>;',
      ),
    },
    {
      env: `export const env = createEnv({
  server: { 'SECRET_TOKEN': z.string() },
  shared: { NODE_ENV: z.string() },
});
`,
    },
  );
  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /`env\.SECRET_TOKEN`/);
});

test('flags it however the env module declares it — brace inside a comment', () => {
  // The other reported silent pass: a `}` in a comment truncated the block the
  // old guard was counting braces through.
  const cwd = fixture(
    {
      'components/Leak.tsx': clientComponent(
        'return <p>{env.SECRET_TOKEN}</p>;',
      ),
    },
    {
      env: `export const env = createEnv({
  server: {
    // A closing brace in prose: }
    SECRET_TOKEN: z.string(),
  },
  shared: { NODE_ENV: z.string() },
});
`,
    },
  );
  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /`env\.SECRET_TOKEN`/);
});

test('flags it however the env module declares it — spread', () => {
  const cwd = fixture(
    {
      'components/Leak.tsx': clientComponent(
        'return <p>{env.SECRET_TOKEN}</p>;',
      ),
    },
    {
      env: `export const env = createEnv({
  server: { ...sharedServerSchema },
  shared: { NODE_ENV: z.string() },
});
`,
    },
  );

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

test('reads a next.config env value written as a template literal', () => {
  const cwd = fixture(
    {
      'components/Version.tsx': clientComponent(
        'return <p>{env.APP_VERSION}</p>;',
      ),
    },
    {
      nextConfig: `const config = {
  env: {
    APP_VERSION: \`v\${pkg.version}\`,
    COMMIT_HASH: commitHash,
  },
};
export default config;
`,
    },
  );
  const result = run(cwd);

  assert.equal(result.status, 0, result.stderr);
});

test('refuses a next.config env map it cannot read rather than shortening it', () => {
  const cwd = fixture(
    {},
    {
      nextConfig: `export default {
  env: {
    ...inheritedEnv,
  },
};
`,
    },
  );
  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot read the property starting at/);
  assert.match(result.stderr, /next\.config\.ts \(`env:`\)/);
  // The message is the whole output: no stack trace for CI to scroll past.
  assert.doesNotMatch(result.stderr, /at topLevelKeys/);
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

test("ignores an `env` imported from another package's subpath", () => {
  // `@codaco/some-package/env` is not this app's env module, and its names have
  // nothing to do with what this app gives the browser.
  const cwd = fixture({
    'components/Other.tsx': clientComponent(
      'return <p>{env.SOMETHING}</p>;',
      '@codaco/some-package/env',
    ),
  });

  assert.equal(run(cwd).status, 0);
});

test('ignores an `env` imported from an unrelated relative path', () => {
  const cwd = fixture({
    'components/feature/env.ts': 'export const env = { SOMETHING: 1 };\n',
    'components/feature/Other.tsx': clientComponent(
      'return <p>{env.SOMETHING}</p>;',
      './env',
    ),
  });

  assert.equal(run(cwd).status, 0);
});

test("follows a relative import that does resolve to the app's env module", () => {
  const cwd = fixture({
    'components/Badge.tsx': clientComponent(
      'return env.SANDBOX_MODE ? <footer /> : null;',
      '../env.js',
    ),
  });

  assert.equal(run(cwd).status, 1);
});

test('does not read the import specifier itself as a use of the binding', () => {
  // `from '~/env.js'` contains the text `env.js`.
  const cwd = fixture({
    'components/Debug.tsx': clientComponent(
      "return env.NODE_ENV === 'development' ? <p /> : null;",
      '~/env.js',
    ),
  });
  const result = run(cwd);

  assert.equal(result.status, 0, result.stderr);
});

test('skips a directory under apps/ that has no env module', () => {
  const cwd = fixture(
    {
      'components/Badge.tsx': clientComponent(
        'return <p>{env.SANDBOX_MODE}</p>;',
      ),
    },
    { env: null },
  );
  const result = run(cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 app\(s\) checked/);
});

test('passes on this repository', () => {
  const result = run(REPO_ROOT);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
