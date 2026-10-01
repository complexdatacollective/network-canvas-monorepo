#!/usr/bin/env node
// CI guard: a client component may not read an environment variable the browser
// is not given.
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
// for a second reason: Next inlines `NEXT_PUBLIC_`/`env` values at build time,
// and Fresco's image is built once and run by deployments that set
// `SANDBOX_MODE` differently at runtime.
//
// WHY THE CHECK IS AN ALLOWLIST. The obvious shape — read the `server:` and
// `shared:` blocks of each `env.js` and flag reads of what they declare — was
// the first version of this script, and review found two ways it could pass
// silently: a quoted key (`'SECRET_TOKEN':`) that its property matcher skipped,
// and a `}` inside a comment that truncated the block it was reading. Both
// produced a variable missing from the guarded set, which reads exactly like a
// variable that is safe. Deriving the ALLOWED names instead makes every
// mis-parse fail the other way: a name this script fails to recognise as
// browser-exposed is reported as an offence, which is loud, visible in the
// diff, and fixable — never a quiet pass. It also needs no knowledge of the
// env module's contents at all, only that the app has one.
//
// SCOPE, stated plainly so the next reader does not over-trust this: it flags a
// direct `NAME.PROPERTY` read where `NAME` is bound by importing `env` from the
// app's own env module, inside a module that itself carries the `'use client'`
// directive. It does NOT follow imports: a shared helper with no directive of
// its own that reads `env.NAME` and is called from a client component is the
// same bug and is not caught here.
//
// Usage: node scripts/buildtime/check-client-env-access.mjs   (from anywhere inside the repo)
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const ENV_MODULE_BASENAMES = ['env.js', 'env.ts', 'env.mjs'];
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
 * A copy of `source` with comments and string-literal contents replaced by
 * spaces — same length, newlines kept — so every index and line number still
 * lines up with the original.
 *
 * Needed in two places, both of which review found reading text as code: the
 * search for `next.config`'s `env` map matched a commented-out one ahead of the
 * real configuration, which made a variable look browser-inlined; and the scan
 * for `env.NAME` reads flagged a comment or string that merely mentioned one.
 *
 * Template literals keep their `${…}` expressions, because `${env.NAME}` is a
 * real read. Regex literals are not recognised: a `/…/` containing something
 * env-shaped reads as code, which errs toward a false offence rather than a
 * missed one.
 */
const blankNonCode = (source) => {
  const out = source.split('');
  const blank = (from, to) => {
    for (let index = from; index < to && index < out.length; index += 1) {
      if (out[index] !== '\n') out[index] = ' ';
    }
  };

  /** Scans code from `from`; with `stopAtCloseBrace`, returns just past its matching `}`. */
  const scanCode = (from, stopAtCloseBrace) => {
    let index = from;
    let depth = 0;
    while (index < source.length) {
      const pair = source.slice(index, index + 2);
      if (pair === '//') {
        const end = source.indexOf('\n', index);
        const stop = end === -1 ? source.length : end;
        blank(index, stop);
        index = stop;
        continue;
      }
      if (pair === '/*') {
        const end = source.indexOf('*/', index);
        const stop = end === -1 ? source.length : end + 2;
        blank(index, stop);
        index = stop;
        continue;
      }
      const character = source[index];
      if (character === "'" || character === '"') {
        let end = index + 1;
        while (end < source.length && source[end] !== character) {
          if (source[end] === '\\') end += 1;
          end += 1;
        }
        blank(index + 1, end);
        index = end + 1;
        continue;
      }
      if (character === '`') {
        index = scanTemplate(index);
        continue;
      }
      if (character === '{') depth += 1;
      else if (character === '}') {
        if (stopAtCloseBrace && depth === 0) return index + 1;
        depth -= 1;
      }
      index += 1;
    }
    return index;
  };

  /** Blanks a template literal's text while leaving its `${…}` code alone. */
  function scanTemplate(start) {
    let index = start + 1;
    let runFrom = index;
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2;
        continue;
      }
      if (source[index] === '`') {
        blank(runFrom, index);
        return index + 1;
      }
      if (source[index] === '$' && source[index + 1] === '{') {
        blank(runFrom, index);
        index = scanCode(index + 2, true);
        runFrom = index;
        continue;
      }
      index += 1;
    }
    blank(runFrom, source.length);
    return source.length;
  }

  scanCode(0, false);
  return out.join('');
};

/**
 * The text inside the braces of `key: { … }`.
 *
 * The search and the brace count both run over a copy with comments and string
 * contents blanked, so neither a commented-out `env: {` nor a brace inside a
 * string can be mistaken for structure; the returned text is sliced from the
 * original. Returns null when the key is absent.
 */
const objectBlock = (source, key) => {
  const code = blankNonCode(source);
  const opening = new RegExp(`(^|[\\s{,])${key}\\s*:\\s*\\{`, 'm').exec(code);
  if (!opening) return null;
  const start = opening.index + opening[0].length;
  let depth = 1;
  for (let index = start; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1;
    if (code[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index);
    }
  }
  return null;
};

/**
 * The keys declared directly in an object block.
 *
 * Used only for `next.config`'s `env` map, which is the allowlist: a key this
 * fails to read is a false offence rather than a missed one. It still refuses
 * anything it cannot account for — a spread, a computed key, a property with no
 * `:` — because a silently shortened allowlist would report offences whose
 * cause is invisible.
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
        'a spread, a computed key or a method shorthand could hide a name from it, ' +
        'so it refuses rather than reporting offences it cannot explain.',
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
 * Whether an import specifier names this app's own env module.
 *
 * `~/…` is the repository's alias for the app root; a relative specifier has to
 * resolve onto the module itself. Accepting every specifier ending in `env`
 * would claim an unrelated `@codaco/some-package/env` or `../feature/env` as
 * this one and report offences against a set of names that has nothing to do
 * with it.
 */
const isAppEnvSpecifier = (specifier, fileDirectory, appEnvPaths) => {
  if (/^~\/env(\.js|\.ts|\.mjs)?$/.test(specifier)) return true;
  if (!specifier.startsWith('.')) return false;
  return appEnvPaths.has(resolve(fileDirectory, specifier));
};

/** The local name the module binds the app's own env object to, or null. */
const envBinding = (source, file, appDirectory) => {
  const fileDirectory = dirname(file);
  const appEnvPaths = new Set([
    join(appDirectory, 'env'),
    ...ENV_MODULE_BASENAMES.map((name) => join(appDirectory, name)),
  ]);
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

  for (const [, clause, specifier] of source.matchAll(pattern)) {
    if (!isAppEnvSpecifier(specifier, fileDirectory, appEnvPaths)) continue;
    for (const entry of clause.split(',')) {
      const [imported, local] = entry
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
    const hasEnvModule = ENV_MODULE_BASENAMES.some(
      (name) => readIfPresent(join(appDirectory, name)) !== null,
    );
    if (!hasEnvModule) continue;
    appsChecked += 1;

    const nextConfigName = [
      'next.config.ts',
      'next.config.js',
      'next.config.mjs',
    ].find((name) => readIfPresent(join(appDirectory, name)) !== null);
    const nextConfigSource =
      nextConfigName === undefined
        ? ''
        : (readIfPresent(join(appDirectory, nextConfigName)) ?? '');
    const inlined = new Set([
      ...ALWAYS_INLINED,
      ...topLevelKeys(
        objectBlock(nextConfigSource, 'env') ?? '',
        `${relative(root, join(appDirectory, nextConfigName ?? 'next.config.ts'))} (\`env:\`)`,
      ),
    ]);

    for (const file of sourceFiles(appDirectory)) {
      const source = readFileSync(file, 'utf8');
      if (!isClientModule(source)) continue;
      const binding = envBinding(source, file, appDirectory);
      if (binding === null) continue;
      // The binding is escaped because `$` is a valid identifier character:
      // interpolating `$env` verbatim gave `$` its regex-anchor meaning, so
      // `$env.SECRET_TOKEN` matched nothing at all.
      // The lookbehind keeps the import specifier itself (`from '~/env.js'`)
      // and any `something.env.NAME` from reading as a use of the binding.
      const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reads = new RegExp(
        `(?<![\\w$./'"\`])${escaped}\\.([A-Za-z_$][\\w$]*)`,
        'g',
      );
      // Comments and string literals are blanked first, so prose or an example
      // that merely mentions `env.NAME` is not reported as a read. Blanking
      // preserves length and newlines, so the line numbers still line up.
      for (const [index, line] of blankNonCode(source).split('\n').entries()) {
        for (const [, name] of line.matchAll(reads)) {
          if (name.startsWith('NEXT_PUBLIC_') || inlined.has(name)) continue;
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
          'Branch on it in the server component that renders this one instead, or — if the browser ' +
          `really does need it — expose it as \`NEXT_PUBLIC_${offence.name}\` or through ` +
          "`next.config`'s `env` map.",
      );
    }
    console.error(
      `\n${offences.length} client-side read(s) of an environment variable the browser is not given.`,
    );
    process.exit(1);
  }

  console.log(
    `No client-side reads of environment variables the browser is not given (${appsChecked} app(s) checked).`,
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
