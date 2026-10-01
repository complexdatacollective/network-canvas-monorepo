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
// ── Why this script does no parsing at all ──
//
// Review of #2030 found eleven ways earlier shapes of this script could pass
// silently, and every one came from the same root: it was lexing TypeScript and
// JSX with regular expressions. Each fix closed one hole and the next review
// found another — a quoted key, a `}` in a comment, a commented-out `env:` map,
// an unrelated object's `env` property, `'use strict'` before `'use client'`, a
// regex literal holding a quote. Hardening the lexer was losing; TSX cannot be
// lexed reliably this way, and `/` is ambiguous in a language where `</a>` and
// `<Foo />` are everywhere.
//
// So the script was rebuilt around one rule: EVERY mistake it can still make
// has to be a false offence, never a missed one. A false offence is loud,
// appears in the diff that caused it, and is fixed by rewording a line. A
// missed read is the hydration failure this guard exists to prevent.
//
// What that buys, concretely:
//
// - It is an allowlist. Reading each `env.js` to learn which names are
//   server-only made every shortfall in that parse read exactly like a variable
//   that is safe. This script never reads an env module's contents; it only
//   notes that the app has one, and flags any name it cannot show the browser
//   receives.
// - The inlined names are written down (`INLINED_BY_NEXT_CONFIG`), not parsed.
//   Deciding which object `next.config` actually exports needs a real parser;
//   `typescript@7` here no longer exposes one and the parsers in the tree are
//   transitive. `assertInlinedNamesStillDeclared` fails if a config stops
//   mentioning a listed name, and adding a name to a config without adding it
//   here produces a false offence.
// - Reads are matched in the raw source, with no attempt to exclude comments or
//   strings. A comment or string that merely mentions `env.NAME` is therefore
//   reported. That is deliberate: the alternative needs a lexer, and a lexer
//   that mis-reads a quote blanks the rest of the module and hides real reads.
//   Reword the line, or move the example out of a client component.
// - Every binding an `env` import might have introduced is scanned, not the
//   first one found, so a commented-out import cannot shadow the live one.
//
// The one thing it does lex is the directive prologue, where there is no
// ambiguity: nothing can precede the first statement but whitespace and
// comments.
//
// SCOPE, stated plainly so the next reader does not over-trust this: it flags a
// direct `NAME.PROPERTY` occurrence where `NAME` is bound by importing `env`
// from the app's own env module, in a module whose directive prologue contains
// `'use client'`. It does NOT follow imports: a shared helper with no directive
// of its own that reads `env.NAME` and is called from a client component is the
// same bug and is not caught here. A real parser is the right tool for that,
// and is the change to make if this script needs to grow.
//
// Usage: node scripts/buildtime/check-client-env-access.mjs   (from anywhere inside the repo)
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const ENV_MODULE_BASENAMES = ['env.js', 'env.ts', 'env.mjs'];
const NEXT_CONFIG_BASENAMES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
];
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

/**
 * Per app, the names its `next.config` `env` map inlines into the browser
 * bundle — written down rather than parsed, for the reason in the header.
 *
 * Add a name here when you add one to an app's `next.config` `env` map.
 */
const INLINED_BY_NEXT_CONFIG = {
  fresco: ['APP_VERSION', 'COMMIT_HASH'],
};

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

/**
 * Whether the module's directive prologue contains `'use client'`.
 *
 * The whole prologue, not just its first directive: Next treats
 * `'use strict'; 'use client';` as a client boundary, and a check anchored to
 * the first directive skipped such a module entirely — every read in it passed.
 *
 * Reading comments here is unambiguous, which it is nowhere else in the file:
 * before the first statement, a `//` or `/*` cannot be inside anything.
 */
const isClientModule = (source) => {
  let rest = source.replace(/^#!.*\n/, '');
  for (;;) {
    rest = rest.replace(/^\s+/, '');
    const comment = /^(\/\/.*(\n|$)|\/\*[\s\S]*?\*\/)/.exec(rest);
    if (comment) {
      rest = rest.slice(comment[0].length);
      continue;
    }
    const directive = /^(['"])([^'"\n]*)\1\s*;?/.exec(rest);
    if (!directive) return false;
    if (directive[2] === 'use client') return true;
    rest = rest.slice(directive[0].length);
  }
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

/**
 * Every local name the module might have bound the app's env object to.
 *
 * Every match rather than the first: a commented-out
 * `// import { env as oldEnv } from '~/env';` above the live import made a
 * first-match search return `oldEnv`, and nothing was then scanned through the
 * real binding. Collecting all of them needs no idea of which lines are code —
 * a name that only ever existed in a comment simply finds no reads.
 */
const envBindings = (source, file, appDirectory) => {
  const fileDirectory = dirname(file);
  const appEnvPaths = new Set([
    join(appDirectory, 'env'),
    ...ENV_MODULE_BASENAMES.map((name) => join(appDirectory, name)),
  ]);
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*)['"]/g;
  const bindings = new Set();

  for (const [, clause, specifier] of source.matchAll(pattern)) {
    if (!isAppEnvSpecifier(specifier.trim(), fileDirectory, appEnvPaths))
      continue;
    for (const entry of clause.split(',')) {
      const [imported, local] = entry
        .split(/\s+as\s+/)
        .map((part) => part.trim());
      if (imported === 'env') bindings.add(local ?? imported);
    }
  }
  return [...bindings];
};

/**
 * Fails when the written-down allowlist names something an app's `next.config`
 * no longer mentions, so the list cannot quietly outlive the configuration it
 * describes. A substring test, deliberately: it cannot mis-lex.
 */
const assertInlinedNamesStillDeclared = (names, nextConfigSource, describe) => {
  const missing = names.filter((name) => !nextConfigSource.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `${describe}: the guard's allowlist names ${missing.join(', ')}, but that file does not ` +
        'mention them. If the `env` map no longer inlines them, remove them from ' +
        'INLINED_BY_NEXT_CONFIG in scripts/buildtime/check-client-env-access.mjs.',
    );
  }
};

/** The names an app gives the browser, beyond the `NEXT_PUBLIC_` prefix. */
const inlinedNamesFor = (appName, appDirectory, root) => {
  const names = INLINED_BY_NEXT_CONFIG[appName] ?? [];
  if (names.length > 0) {
    const configName = NEXT_CONFIG_BASENAMES.find(
      (name) => readIfPresent(join(appDirectory, name)) !== null,
    );
    const configSource =
      configName === undefined
        ? ''
        : (readIfPresent(join(appDirectory, configName)) ?? '');
    assertInlinedNamesStillDeclared(
      names,
      configSource,
      relative(
        root,
        join(appDirectory, configName ?? NEXT_CONFIG_BASENAMES[0]),
      ),
    );
  }
  return new Set([...ALWAYS_INLINED, ...names]);
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

    const inlined = inlinedNamesFor(appName, appDirectory, root);

    for (const file of sourceFiles(appDirectory)) {
      const source = readFileSync(file, 'utf8');
      if (!isClientModule(source)) continue;
      const describe = relative(root, file);
      const lines = source.split('\n');

      for (const binding of envBindings(source, file, appDirectory)) {
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
        for (const [index, line] of lines.entries()) {
          for (const [, name] of line.matchAll(reads)) {
            if (name.startsWith('NEXT_PUBLIC_') || inlined.has(name)) continue;
            offences.push({
              file: describe,
              line: index + 1,
              name,
              app: appName,
            });
          }
        }
      }
    }
  }

  if (offences.length > 0) {
    for (const offence of offences) {
      console.error(
        `${offence.file}:${offence.line}: \`env.${offence.name}\` appears in a 'use client' module, ` +
          `but ${offence.app} does not expose it to the browser, so it is \`undefined\` there. ` +
          'Branch on it in the server component that renders this one instead, or — if the browser ' +
          `really does need it — expose it as \`NEXT_PUBLIC_${offence.name}\` or through ` +
          "`next.config`'s `env` map (adding it to INLINED_BY_NEXT_CONFIG in this guard). " +
          'If it is a comment or a string rather than a read, reword it: this guard does not parse.',
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
