// The web/worker split is structural, not conventional (#1895): "neither
// process may do the other's work" is only true if neither process can. What a
// module graph reaches is what a process loads, so the four entrypoints are
// checked against each other here rather than against a habit.
//
// The runtime half of the same rule is proved elsewhere: the grants suite
// (src/jobs/__tests__/grants.test.ts) shows the application role refused
// a claim with 42501, so even a web process that did load the worker could not
// execute a job.
//
// Since stage 1 of the Effect 4 migration (#1927) each entry is a one-line
// file over a program in src/programs/, and the graph is read from the entry
// — so the program, the shell it composes and every service it wires are what
// is inspected, the same way the bundler sees them (vite.config.ts names the
// same four files as its entries).
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { sourceTokens } from './support/source-tokens.ts';

const SERVER_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const REPO_ROOT = resolve(SERVER_ROOT, '..', '..', '..');

/**
 * Every module specifier in a file, through the tokenizer rather than a
 * regular expression: a specifier named in a comment or inside a string
 * cannot add to the graph, and a real one cannot hide from it.
 *
 * All three forms that reach a module, because a graph that followed only the
 * first would report a process as free of what it loads by either of the
 * others: `from 'x'` for a static import or re-export, `import 'x'` for a
 * side-effect import, which has no `from` at all, and `import('x')` for a
 * dynamic one — the form a lazily loaded transport or router would arrive by.
 * `from` is a contextual keyword, so what identifies it is a `from`
 * immediately followed by a string literal, which no expression produces;
 * `import` is reserved, so a literal after it, or after its opening
 * parenthesis, is always a specifier.
 */
function moduleSpecifiers(source: string): string[] {
  const tokens = sourceTokens(source);
  const literalAt = (index: number): string | undefined => {
    const token = tokens[index];
    return token?.raw.startsWith("'") || token?.raw.startsWith('"')
      ? token.value
      : undefined;
  };

  const specifiers: string[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.raw !== 'from' && token.raw !== 'import') continue;
    const specifier =
      literalAt(index + 1) ??
      (token.raw === 'import' && tokens[index + 1]?.raw === '('
        ? literalAt(index + 2)
        : undefined);
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

type ModuleGraph = {
  /** Server-relative paths of every module the entry statically reaches. */
  modules: Set<string>;
  /** Every package the entry statically reaches, at any depth. */
  packages: Set<string>;
};

/**
 * Relative specifiers only, which is enough: a package cannot import its way
 * back into this source tree, so following them reaches every module of ours
 * the entry loads.
 */
function moduleGraph(entry: string): ModuleGraph {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const pending = [resolve(SERVER_ROOT, entry)];

  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) break;
    const path = relative(SERVER_ROOT, file);
    if (modules.has(path)) continue;
    modules.add(path);
    for (const specifier of moduleSpecifiers(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) {
        pending.push(resolve(dirname(file), specifier));
      } else {
        packages.add(specifier);
      }
    }
  }

  return { modules, packages };
}

function reached(
  { modules, packages }: ModuleGraph,
  names: string[],
): string[] {
  return names.filter((name) => modules.has(name) || packages.has(name));
}

/**
 * Everything that runs a job rather than creating one: the worker itself, the
 * list of what this deployment works, and the handlers that do the work. Only
 * the worker process may reach any of it.
 */
const JOB_EXECUTION = [
  'src/jobs/worker.ts',
  'src/jobs/registrations.ts',
  'src/jobs/handlers/invitation-delivery.ts',
  'src/jobs/handlers/sign-in-email.ts',
  'src/jobs/handlers/protocol-store-gc.ts',
  'src/jobs/handlers/denied-attempts-summary.ts',
];

/** The four bundle entries (vite.config.ts), one process or command each, and the program each is a shell over. */
const ENTRIES = {
  'src/index.ts': './programs/serve.ts',
  'src/worker.ts': './programs/worker.ts',
  'src/migrate.ts': './programs/migrate.ts',
  'src/rotate-secrets.ts': './programs/rotate-secrets.ts',
} as const;

describe('the import inventory', () => {
  it('follows every form one module reaches another by', () => {
    // The inventory above is only as complete as this: a specifier it does
    // not follow is a module the graph reports as unreached, which is how a
    // process could load the mail transport or the HTTP app and still pass.
    //
    // Mutation: drop the `import` half of `moduleSpecifiers` (follow `from`
    // alone, as it did before) and the side-effect and dynamic specifiers
    // below go missing.
    expect(
      moduleSpecifiers(
        [
          "import { named } from './named.ts';",
          "import './side-effect.ts';",
          "const lazy = await import('./dynamic.ts');",
          "export * from './re-export.ts';",
          "import type { Shape } from './type-only.ts';",
          "// import './commented-out.ts';",
          'const quoted = "import \'./inside-a-string.ts\';";',
        ].join('\n'),
      ),
    ).toEqual([
      './named.ts',
      './side-effect.ts',
      './dynamic.ts',
      './re-export.ts',
      './type-only.ts',
    ]);
  });
});

describe('every entry', () => {
  it('is one file over its program', () => {
    // D8: the bundle entries stay one file each, because this test — and the
    // bundler — read the graph from them. The only module an entry names is
    // its program; everything the process is lives there.
    for (const [entry, program] of Object.entries(ENTRIES)) {
      const relativeSpecifiers = moduleSpecifiers(
        readFileSync(resolve(SERVER_ROOT, entry), 'utf8'),
      ).filter((specifier) => specifier.startsWith('.'));
      expect(relativeSpecifiers, entry).toEqual([program]);
    }
  });

  it('reaches @effect/platform-node by subpath only', () => {
    // The package's barrel imports its Redis module, and `redis` is
    // deliberately not installed (pnpm-workspace.yaml makes the peer
    // optional so a second Redis client stays out of the image): a bare
    // `from '@effect/platform-node'` fails at boot with
    // ERR_MODULE_NOT_FOUND. Mutation: import `NodeRuntime` from the barrel in
    // any entry.
    for (const entry of Object.keys(ENTRIES)) {
      const { packages } = moduleGraph(entry);
      expect(packages.has('@effect/platform-node'), entry).toBe(false);
      expect(packages.has('@effect/platform-node/NodeRuntime'), entry).toBe(
        true,
      );
      expect(packages.has('redis'), entry).toBe(false);
    }
  });
});

describe('the worker process', () => {
  const graph = moduleGraph('src/worker.ts');

  it('serves nothing but the health routes', () => {
    // It does serve HTTP — the loopback health listener a container
    // healthcheck polls (#1897) — so "binds no port" is not the reading. What
    // stays true is that it holds none of Studio's surfaces: loading the
    // router, the Hono residue or the RPC router would not make it answer a
    // request by itself, but it is how one arrives a refactor later, and the
    // import is the observable half of "this process serves no user".
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/http/hono-bridge.ts',
        'src/http/ws-bridge.ts',
        'src/rpc.ts',
        'src/api.ts',
        'src/assets.ts',
        '@orpc/server',
        'hono',
        // The WebSocket server is the web process's; nothing upgrades here.
        'ws',
      ]),
    ).toEqual([]);
  });

  it('answers the healthcheck from a module that reaches no surface', () => {
    // The positive half: the routes it does serve come from
    // src/http/health.ts, whose own graph is checked below, on Effect's Node
    // server. Without this, "no app" would also be satisfied by a worker that
    // had quietly stopped answering at all.
    expect(
      reached(graph, [
        'src/http/health.ts',
        '@effect/platform-node/NodeHttpServer',
      ]),
    ).toEqual(['src/http/health.ts', '@effect/platform-node/NodeHttpServer']);
  });

  it('is the process that holds the mail transport', () => {
    // The other half of the split: sends happen here, so this graph must
    // reach the transport where the web process's must not.
    expect(
      reached(graph, ['src/mail/live.ts', 'src/mail/smtp.ts', 'nodemailer']),
    ).toEqual(['src/mail/live.ts', 'src/mail/smtp.ts', 'nodemailer']);
  });

  it('is the process that executes jobs', () => {
    // The worker claims, settles, reaps, sweeps retention and ticks the cron;
    // the registrations are the list of what this deployment runs, and the
    // handlers are the work itself.
    expect(reached(graph, JOB_EXECUTION)).toEqual(JOB_EXECUTION);
  });
});

describe('the health routes', () => {
  const graph = moduleGraph('src/http/health.ts');

  it('reach neither the app nor the RPC router', () => {
    // Both processes mount these routes, so this module is the one place a
    // surface could reach the worker without naming it. Its graph is checked
    // directly rather than through the worker's, so a future health check that
    // imported the app would fail here with the reason rather than as a
    // puzzling entry in the worker's inventory.
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/rpc.ts',
        'src/api.ts',
        'src/assets.ts',
        '@orpc/server',
        'hono',
        'ws',
      ]),
    ).toEqual([]);
  });
});

describe('the migrate process', () => {
  const graph = moduleGraph('src/migrate.ts');

  it('carries no drizzle-kit into the image', () => {
    // The invariant the whole design of `studio-api migrate` rests on (#1909):
    // drizzle-kit is a development dependency and the image installs
    // production dependencies only, so a bundle that reached it would fail at
    // import in the container rather than here. The DDL it executes is
    // rendered at build time instead, by scripts/render-schema-ddl.ts.
    expect(
      reached(graph, [
        'drizzle-kit',
        'drizzle-kit/api-postgres',
        'scripts/apply.ts',
      ]),
    ).toEqual([]);
  });

  it('serves nothing', () => {
    // A one-shot: it connects, applies, and exits.
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/rpc.ts',
        'hono',
        '@effect/platform-node/NodeHttpServer',
      ]),
    ).toEqual([]);
  });
});

describe('the web process', () => {
  const graph = moduleGraph('src/index.ts');

  it('serves through the Effect router over the Hono residue', () => {
    // The positive half of the shell: the process is the Effect server, with
    // today's Hono app mounted behind it until stage 9 removes it.
    expect(
      reached(graph, [
        'src/http/router.ts',
        'src/http/hono-bridge.ts',
        'src/http/ws-bridge.ts',
        'src/app.ts',
        '@effect/platform-node/NodeHttpServer',
      ]),
    ).toEqual([
      'src/http/router.ts',
      'src/http/hono-bridge.ts',
      'src/http/ws-bridge.ts',
      'src/app.ts',
      '@effect/platform-node/NodeHttpServer',
    ]);
  });

  it('loads nothing that executes a job', () => {
    // The web process may create a job and nothing else. Reaching the worker,
    // its registrations or any handler would put the claim loop one call away
    // in a process whose role cannot execute one anyway — and would carry the
    // handlers' own dependencies (the mail transport, the rate-limit store)
    // with them.
    expect(reached(graph, JOB_EXECUTION)).toEqual([]);
  });

  it('holds no mail transport', () => {
    // "The web process holds no mail transport" (#1895) as a property of the
    // build rather than of the wiring: with nodemailer out of the graph there
    // is no transport to construct, whatever an entrypoint asks for. The
    // `Mailer` tag itself (src/mail/mailer.ts) may travel — it is
    // implementation-free — but the selector and the transport may not.
    //
    // Mutation: import src/mail/live.ts from src/programs/serve.ts.
    expect(
      reached(graph, ['src/mail/live.ts', 'src/mail/smtp.ts', 'nodemailer']),
    ).toEqual([]);
  });

  it('cannot re-key the database while it is serving it', () => {
    // Rotation rewrites every stored secret under a maintenance identity, in
    // batches, and is something a person runs once (#1900). A web process that
    // could reach it is one refactor from doing it on a request; it is an
    // entry of its own instead (src/rotate-secrets.ts, below).
    expect(reached(graph, ['src/secrets/rotate.ts'])).toEqual([]);
  });

  it('creates jobs through the enqueue-only client', () => {
    // The positive half, so that "no worker" cannot be satisfied by having no
    // queue at all. One module now: the node-postgres enqueue, which renders
    // its statement through `src/jobs/insert.ts` and sends it on the
    // command's own transaction client.
    expect(reached(graph, ['src/jobs/client.ts'])).toEqual([
      'src/jobs/client.ts',
    ]);
  });

  it('carries no Effect SQL driver for that enqueue', () => {
    // The invariant `src/jobs/insert.ts`'s own header exists for, and which
    // `src/jobs/queues.ts` repeats over `JOB_SCHEMA`: the statement lives
    // apart from `src/jobs/jobs.ts` so that this graph reaches no
    // `@effect/sql-pg`. The web process runs its commands on node-postgres,
    // and a second Postgres driver pulled in behind the enqueue would be paid
    // for by every web container while nothing here could use it.
    //
    // The modules are named beside the package because the package is only
    // absent as long as they are: each of them imports it (directly, or
    // through `database.ts`), so naming them says which import would be the
    // one that did it.
    //
    // Mutation: `import { Transaction } from './database.ts';` in
    // src/jobs/client.ts — the module and the package both appear.
    expect(
      reached(graph, [
        '@effect/sql-pg',
        'src/jobs/database.ts',
        'src/jobs/jobs.ts',
        'src/jobs/clock.ts',
        'src/jobs/install.ts',
      ]),
    ).toEqual([]);
  });
});

// The fourth entry, and the other side of "the web process cannot re-key the
// database while it is serving it" above: the rotation is a process of its own
// (#1900), so the separation runs both ways — the web process cannot reach the
// rotation, and the rotation loads neither the HTTP surface nor the job
// worker.
describe('the rotation process', () => {
  const graph = moduleGraph('src/rotate-secrets.ts');

  it('is the process that re-keys the stored secrets', () => {
    // The positive half: "the web process cannot reach the rotation" would be
    // satisfiable by nothing reaching it at all.
    expect(reached(graph, ['src/secrets/rotate.ts'])).toEqual([
      'src/secrets/rotate.ts',
    ]);
  });

  it('serves nothing and runs no job', () => {
    // It runs to completion and exits under the maintenance role. An HTTP
    // surface or the job worker in this graph is how a command becomes a
    // second server one refactor later.
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/rpc.ts',
        'hono',
        '@effect/platform-node/NodeHttpServer',
        'ws',
        ...JOB_EXECUTION,
      ]),
    ).toEqual([]);
  });
});

describe('the image', () => {
  /**
   * Only what the assertion below reads: the snapshots section, each entry's
   * dependency names. Decoded rather than cast, so a lockfile shape pnpm
   * changes fails here with the path rather than as `undefined` somewhere
   * below.
   */
  const Lockfile = Schema.Struct({
    snapshots: Schema.Record(
      Schema.String,
      Schema.Struct({
        dependencies: Schema.optionalKey(
          Schema.Record(Schema.String, Schema.String),
        ),
      }),
    ),
  });

  /** The lockfile snapshot of `@effect/platform-node`, whatever its resolution suffix. */
  function platformNodeSnapshot() {
    const lockfile = Schema.decodeUnknownSync(Lockfile)(
      parseYaml(readFileSync(resolve(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8')),
    );
    const entries = Object.entries(lockfile.snapshots).filter(([key]) =>
      key.startsWith('@effect/platform-node@'),
    );
    const [snapshot, ...others] = entries;
    if (snapshot === undefined || others.length > 0) {
      throw new Error(
        `expected exactly one @effect/platform-node snapshot, found ${entries.length}`,
      );
    }
    return snapshot[1];
  }

  it('carries one Redis client', () => {
    // `@effect/platform-node` declares `redis` as a hard peer for a cluster
    // module Studio never imports. With `autoInstallPeers` pnpm installs a
    // hard peer regardless of `peerDependencyRules.ignoreMissing`, and it
    // would reach the image beside ioredis (the rate-limit store's client).
    // pnpm-workspace.yaml makes the peer optional through
    // `packageExtensions`; this is what says it worked. Mutation: remove that
    // extension and reinstall.
    expect(
      Object.keys(platformNodeSnapshot().dependencies ?? {}),
    ).not.toContain('redis');
  });
});
