#!/usr/bin/env node
// CI guard: a client component may not read a server-only environment variable.
//
// Next only defines `NEXT_PUBLIC_`-prefixed variables (and whatever
// `next.config`'s `env` map inlines) in the browser. A `'use client'` module
// that reads anything else off the validated `env` object therefore sees
// `undefined` there while the server sees the real value — and if the component
// branches on it, the server renders markup the client does not, React finds a
// node it did not produce, and hydration fails for the whole page. React
// discards the tree and keeps the server markup, so every interactive element
// below the failure stops working.
//
// That is not hypothetical. Until October 2026 Fresco's `NetlifyBadge` and
// `SandboxCredentials` both opened with `if (!env.SANDBOX_MODE) return null`,
// from inside `'use client'`. On the sandbox deployment, which is the only one
// that sets the variable, PostHog recorded React error #418 (`args[]=HTML`) on
// `/signin` and `/dashboard`: the server rendered the badge and the credentials
// notice, the client rendered neither, and the sign-in page lost its client
// behaviour along with the notice that tells visitors the demo password.
//
// The fix is to decide in the server component that renders the client one —
// `{env.SANDBOX_MODE && <NetlifyBadge />}` — so the branch happens where the
// variable exists. Exposing the variable to the browser instead would be wrong
// here for a second reason: Next inlines `NEXT_PUBLIC_`/`env` values at build
// time, and Fresco's image is built once and run by deployments that set
// `SANDBOX_MODE` differently at runtime.
//
// SCOPE, stated plainly so the next reader does not over-trust this: it reads
// each app's own `env.js` for the variables it declares, and each app's
// `next.config` for the ones it inlines, so the allowlist cannot drift from the
// configuration. It flags only a direct `env.NAME` read inside a module that
// itself carries the `'use client'` directive. It does NOT follow imports: a
// shared helper with no directive of its own that reads `env.NAME` and is
// called from a client component is the same bug and is not caught here.
//
// Usage: node scripts/buildtime/check-client-env-access.mjs   (from anywhere inside the repo)
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'out',
  'dist',
  'build',
  'storybook-static',
  'coverage',
]);

/**
 * `process.env.NODE_ENV` is replaced by every bundler, so it is the one
 * variable that is defined in the browser without being declared anywhere.
 */
const ALWAYS_INLINED = ['NODE_ENV'];

const repoRoot = (cwd) =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();

const readIfPresent = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/**
 * The text inside the braces of `key: { … }`, matched by counting braces so a
 * nested object cannot end the block early. String and template literals are
 * skipped, so a brace inside a message or a regex is not counted.
 */
const objectBlock = (source, key) => {
  const opening = new RegExp(`(^|[\\s{,])${key}\\s*:\\s*\\{`, 'm').exec(source);
  if (!opening) return null;
  const start = opening.index + opening[0].length;
  let depth = 1;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      const quote = character;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index);
    }
  }
  return null;
};

/**
 * The keys declared directly in an object block.
 *
 * This reads the block exhaustively and **throws** on any property it cannot
 * account for — a spread (`...sharedServerSchema`), a computed key, a method
 * shorthand — rather than passing over it. A key this misses is a variable
 * missing from the guarded set, which is a silent pass: exactly the failure a
 * guard must not have. Quoted keys (`'SECRET_TOKEN': …`) are read, since they
 * declare a variable like any other.
 */
const topLevelKeys = (block, describe) => {
  const keys = [];
  let index = 0;

  const skipSpace = () => {
    for (;;) {
      while (index < block.length && /\s/.test(block[index])) index += 1;
      if (block.startsWith('//', index)) {
        const end = block.indexOf('\n', index);
        index = end === -1 ? block.length : end + 1;
        continue;
      }
      if (block.startsWith('/*', index)) {
        const end = block.indexOf('*/', index);
        index = end === -1 ? block.length : end + 2;
        continue;
      }
      return;
    }
  };

  /** Advances past a quoted string, returning its contents. */
  const readQuoted = () => {
    const quote = block[index];
    index += 1;
    let value = '';
    while (index < block.length && block[index] !== quote) {
      if (block[index] === '\\') {
        value += block[index + 1] ?? '';
        index += 2;
        continue;
      }
      value += block[index];
      index += 1;
    }
    index += 1;
    return value;
  };

  /** Advances past one property's value, stopping at the separating comma. */
  const skipValue = () => {
    let depth = 0;
    while (index < block.length) {
      const character = block[index];
      if (character === "'" || character === '"' || character === '`') {
        readQuoted();
        continue;
      }
      if (block.startsWith('//', index) || block.startsWith('/*', index)) {
        skipSpace();
        continue;
      }
      if (character === '{' || character === '(' || character === '[')
        depth += 1;
      else if (character === '}' || character === ')' || character === ']')
        depth -= 1;
      else if (character === ',' && depth === 0) return;
      index += 1;
    }
  };

  const unreadable = () =>
    new Error(
      `${describe}: cannot read the property starting at ${JSON.stringify(
        block.slice(index, index + 48),
      )}. The guard only understands \`NAME: value\` and \`'NAME': value\` properties; ` +
        'a spread, a computed key or a method shorthand could hide a variable from it, ' +
        'so it refuses rather than reporting a pass it cannot support.',
    );

  for (;;) {
    skipSpace();
    while (block[index] === ',' || block[index] === ';') {
      index += 1;
      skipSpace();
    }
    if (index >= block.length) return keys;

    let name;
    const identifier = /^[A-Za-z_$][\w$]*/.exec(block.slice(index));
    if (identifier) {
      name = identifier[0];
      index += identifier[0].length;
    } else if (block[index] === "'" || block[index] === '"') {
      name = readQuoted();
    } else {
      throw unreadable();
    }

    skipSpace();
    if (block[index] !== ':') throw unreadable();
    index += 1;
    keys.push(name);
    skipValue();
  }
};

const sourceFiles = (directory, collected = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(path, collected);
    else if (
      SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      collected.push(path);
    }
  }
  return collected;
};

/** Whether the module opens with the `'use client'` directive. */
const isClientModule = (source) => {
  const head = source
    .replace(/^#!.*\n/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trimStart();
  return /^(['"])use client\1\s*;?/.test(head);
};

/**
 * The local name the module binds the validated env object to, or null when it
 * does not import one. Matches the app's own env module by path, so an
 * unrelated `env` import is not mistaken for it.
 */
const envBinding = (source) => {
  const pattern =
    /import\s*\{([^}]*)\}\s*from\s*['"](?:[~@./][^'"]*\/)?env(?:\.js)?['"]/g;
  for (const [, clause] of source.matchAll(pattern)) {
    for (const specifier of clause.split(',')) {
      const [imported, local] = specifier
        .split(/\s+as\s+/)
        .map((part) => part.trim());
      if (imported === 'env') return local ?? imported;
    }
  }
  return null;
};

const main = () => {
  const root = repoRoot(process.cwd());
  const appsDirectory = join(root, 'apps');
  let appNames = [];
  try {
    appNames = readdirSync(appsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    appNames = [];
  }

  const offences = [];
  let appsChecked = 0;

  for (const appName of appNames) {
    const appDirectory = join(appsDirectory, appName);
    const envSource = readIfPresent(join(appDirectory, 'env.js'));
    if (envSource === null) continue;

    const declared = ['server', 'shared'].flatMap((key) => {
      const block = objectBlock(envSource, key);
      if (block === null) {
        throw new Error(
          `${relative(root, join(appDirectory, 'env.js'))}: no \`${key}:\` block found. ` +
            'The guard reads it to know which variables are server-only; fix the ' +
            'guard rather than letting it pass over an env module it cannot read.',
        );
      }
      return topLevelKeys(
        block,
        `${relative(root, join(appDirectory, 'env.js'))} (\`${key}:\`)`,
      );
    });

    const nextConfigName = [
      'next.config.ts',
      'next.config.js',
      'next.config.mjs',
    ].find((name) => readIfPresent(join(appDirectory, name)) !== null);
    const nextConfigSource =
      nextConfigName === undefined
        ? ''
        : (readIfPresent(join(appDirectory, nextConfigName)) ?? '');
    const inlined = [
      ...ALWAYS_INLINED,
      ...topLevelKeys(
        objectBlock(nextConfigSource, 'env') ?? '',
        `${relative(root, join(appDirectory, nextConfigName ?? 'next.config.ts'))} (\`env:\`)`,
      ),
    ];

    const guarded = new Set(
      declared.filter(
        (name) => !name.startsWith('NEXT_PUBLIC_') && !inlined.includes(name),
      ),
    );
    if (guarded.size === 0) continue;
    appsChecked += 1;

    for (const file of sourceFiles(appDirectory)) {
      const source = readFileSync(file, 'utf8');
      if (!isClientModule(source)) continue;
      const binding = envBinding(source);
      if (binding === null) continue;
      const reads = new RegExp(`\\b${binding}\\.([A-Za-z_$][\\w$]*)`, 'g');
      const lines = source.split('\n');
      for (const [index, line] of lines.entries()) {
        for (const [, name] of line.matchAll(reads)) {
          if (!guarded.has(name)) continue;
          offences.push({
            file: relative(root, file),
            line: index + 1,
            name,
            app: appName,
          });
        }
      }
    }
  }

  if (offences.length > 0) {
    for (const offence of offences) {
      console.error(
        `${offence.file}:${offence.line}: \`env.${offence.name}\` is read in a 'use client' module, ` +
          `but ${offence.app} does not expose it to the browser, so it is \`undefined\` there. ` +
          'Branch on it in the server component that renders this one instead.',
      );
    }
    console.error(
      `\n${offences.length} client-side read(s) of a server-only environment variable.`,
    );
    process.exit(1);
  }

  console.log(
    `No client-side reads of server-only environment variables (${appsChecked} app(s) checked).`,
  );
};

// A guard that cannot read its inputs fails loudly and readably: the message
// says which file it choked on, without a stack trace nobody reads in CI.
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
