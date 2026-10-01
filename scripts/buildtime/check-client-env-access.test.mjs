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
  server: { DATABASE_URL: z.string() },
  shared: { NODE_ENV: z.string(), SANDBOX_MODE: z.stringbool().optional() },
  runtimeEnv: {},
});
`;

/**
 * A throwaway git repository holding one app under apps/<app>/. The app is
 * named `fresco` only where a test needs the written-down allowlist, since that
 * is keyed by app name.
 */
function fixture(
  files,
  { app = 'thing', env = ENV_MODULE, nextConfig = null } = {},
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

test('flags it whatever the env module looks like, since that is never read', () => {
  // Four shapes that each defeated an earlier design which derived the guarded
  // names from `env.js`: a quoted key, a `}` inside a comment, a spread, and a
  // schema this script could not parse at all.
  for (const env of [
    `export const env = createEnv({ server: { 'SECRET_TOKEN': z.string() } });`,
    `export const env = createEnv({ server: {
      // a closing brace in prose: }
      SECRET_TOKEN: z.string(),
    } });`,
    `export const env = createEnv({ server: { ...sharedServerSchema } });`,
    `export const env = somethingElseEntirely();`,
  ]) {
    const cwd = fixture(
      {
        'components/Leak.tsx': clientComponent(
          'return <p>{env.SECRET_TOKEN}</p>;',
        ),
      },
      { env },
    );

    assert.equal(
      run(cwd).status,
      1,
      `expected an offence for env module: ${env}`,
    );
  }
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

test('allows a NEXT_PUBLIC_ variable', () => {
  const cwd = fixture({
    'components/Search.tsx': clientComponent(
      'return <p>{env.NEXT_PUBLIC_THING}</p>;',
    ),
  });

  assert.equal(run(cwd).status, 0);
});

test("allows a name the guard's written-down allowlist carries for that app", () => {
  const cwd = fixture(
    {
      'components/Version.tsx': clientComponent(
        'return <p>{env.APP_VERSION}</p>;',
      ),
    },
    {
      app: 'fresco',
      nextConfig:
        'export default { env: { APP_VERSION: 1, COMMIT_HASH: 2 } };\n',
    },
  );
  const result = run(cwd);

  assert.equal(result.status, 0, result.stderr);
});

test('refuses an allowlist entry the app config no longer mentions', () => {
  // The written-down list may not outlive the configuration it describes.
  const cwd = fixture(
    {},
    { app: 'fresco', nextConfig: 'export default {};\n' },
  );
  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /allowlist names APP_VERSION, COMMIT_HASH/);
  assert.match(result.stderr, /next\.config\.ts/);
  // The message is the whole output: no stack trace for CI to scroll past.
  assert.doesNotMatch(result.stderr, /at main/);
});

test('does not treat an unrelated object literal in next.config as the env map', () => {
  // `const fixture = { env: { SECRET_TOKEN: 'x' } }; export default {};` made a
  // text search for `env: {` read SECRET_TOKEN as browser-inlined.
  const cwd = fixture(
    {
      'components/Leak.tsx': clientComponent(
        'return <p>{env.SECRET_TOKEN}</p>;',
      ),
    },
    {
      app: 'fresco',
      nextConfig: `const unrelated = { env: { SECRET_TOKEN: 'x' } };
export default { env: { APP_VERSION: 1, COMMIT_HASH: 2 } };
`,
    },
  );
  const result = run(cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /`env\.SECRET_TOKEN`/);
});

test('reads the whole directive prologue, not just its first directive', () => {
  // Next treats `'use strict'; 'use client';` as a client boundary; a check
  // anchored to the first directive skipped the module and every read in it.
  const cwd = fixture({
    'components/Prologue.tsx': `'use strict';
'use client';

import { env } from '~/env';

export default function P() {
  return <p>{env.SANDBOX_MODE}</p>;
}
`,
  });

  assert.equal(run(cwd).status, 1);
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

test('escapes a binding whose name carries regex syntax', () => {
  // `$` is a valid identifier character, and interpolating `$env` verbatim gave
  // it anchor semantics, so `$env.SANDBOX_MODE` matched nothing.
  const cwd = fixture({
    'components/Dollar.tsx': `'use client';

import { env as $env } from '~/env';

export default function Dollar() {
  return <p>{$env.SANDBOX_MODE}</p>;
}
`,
  });

  assert.equal(run(cwd).status, 1);
});

test('scans every binding an env import introduced, not the first found', () => {
  // A commented-out `import { env as oldEnv }` above the live import made a
  // first-match search return `oldEnv` and scan nothing through `env`.
  const cwd = fixture({
    'components/Commented.tsx': `'use client';

// import { env as oldEnv } from '~/env';
import { env } from '~/env';

export default function C() {
  return <p>{env.SANDBOX_MODE}</p>;
}
`,
  });

  assert.equal(run(cwd).status, 1);
});

test('is unaffected by a regex literal holding a quote', () => {
  // Lexing this as a string blanked the rest of the module and hid the read.
  const cwd = fixture({
    'components/Rx.tsx': `'use client';

import { env } from '~/env';

const quote = /['"]/;

export default function R() {
  return <p>{quote.source}{env.SANDBOX_MODE}</p>;
}
`,
  });

  assert.equal(run(cwd).status, 1);
});

test('is unaffected by the slashes in JSX', () => {
  const cwd = fixture({
    'components/Jsx.tsx': `'use client';

import { env } from '~/env';

export default function J() {
  return (
    <a href="/x">
      <img src="/y" />
      {env.SANDBOX_MODE}
    </a>
  );
}
`,
  });

  assert.equal(run(cwd).status, 1);
});

test('catches a read inside a template interpolation', () => {
  const cwd = fixture({
    'components/Tpl.tsx': clientComponent(
      'return <p>{`mode ${env.SANDBOX_MODE}`}</p>;',
    ),
  });

  assert.equal(run(cwd).status, 1);
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

test("ignores an `env` imported from another package's subpath", () => {
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
