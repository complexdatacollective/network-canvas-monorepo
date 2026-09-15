// The web/worker split is structural, not conventional (#1895): "neither
// process may do the other's work" is only true if neither process can. What a
// module graph reaches is what a process loads, so the two entrypoints are
// checked against each other here rather than against a habit.
//
// The runtime half of the same rule is proved elsewhere: the grants suite
// (src/jobs/__tests__/grants.test.ts) shows the application role's `fetch()`
// refused with 42501, so even a web process that did load the worker could not
// execute a job.
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceTokens } from './support/source-tokens.ts';

const SERVER_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

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

describe('the worker process', () => {
  const graph = moduleGraph('src/worker.ts');

  it('serves nothing but the health routes', () => {
    // It does serve HTTP now — the loopback health listener a container
    // healthcheck polls (#1897) — so "binds no port" is no longer the reading.
    // What stays true is that it holds none of Studio's surfaces: loading the
    // app or the RPC router would not make it answer a request by itself, but
    // it is how one arrives a refactor later, and the import is the observable
    // half of "this process serves no user".
    expect(
      reached(graph, [
        'src/app.ts',
        'src/rpc.ts',
        'src/api.ts',
        'src/assets.ts',
        '@orpc/server',
        // The WebSocket server is the web process's; nothing upgrades here.
        'ws',
      ]),
    ).toEqual([]);
  });

  it('answers the healthcheck from a module that reaches no surface', () => {
    // The positive half: the routes it does serve come from src/health.ts,
    // whose own graph is checked below. Without this, "no app" would also be
    // satisfied by a worker that had quietly stopped answering at all.
    expect(reached(graph, ['src/health.ts', '@hono/node-server'])).toEqual([
      'src/health.ts',
      '@hono/node-server',
    ]);
  });

  it('is the process that holds the mail transport', () => {
    // The other half of the split: sends happen here, so this graph must
    // reach the transport where the web process's must not.
    expect(reached(graph, ['src/auth/email.ts', 'nodemailer'])).toEqual([
      'src/auth/email.ts',
      'nodemailer',
    ]);
  });
});

describe('the health routes', () => {
  const graph = moduleGraph('src/health.ts');

  it('reach neither the app nor the RPC router', () => {
    // Both processes mount these routes, so this module is the one place a
    // surface could reach the worker without naming it. Its graph is checked
    // directly rather than through the worker's, so a future health check that
    // imported the app would fail here with the reason rather than as a
    // puzzling entry in the worker's inventory.
    expect(
      reached(graph, [
        'src/app.ts',
        'src/rpc.ts',
        'src/api.ts',
        '@orpc/server',
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
      reached(graph, ['src/app.ts', 'src/rpc.ts', 'hono', '@hono/node-server']),
    ).toEqual([]);
  });
});

describe('the web process', () => {
  const graph = moduleGraph('src/index.ts');

  it('loads nothing that executes a job', () => {
    // pg-boss's worker instance supervises, schedules and fetches; the web
    // process's instance may only create a job. Reaching either the worker or
    // its registrations would put the fetch loop one call away in a process
    // whose role cannot execute one anyway.
    expect(
      reached(graph, ['src/jobs/worker.ts', 'src/jobs/register.ts']),
    ).toEqual([]);
  });

  it('holds no mail transport', () => {
    // "The web process holds no mail transport" (#1895) as a property of the
    // build rather than of the wiring: with nodemailer out of the graph there
    // is no transport to construct, whatever an entrypoint asks for.
    expect(reached(graph, ['src/auth/email.ts', 'nodemailer'])).toEqual([]);
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
    // queue at all.
    expect(
      reached(graph, ['src/jobs/client.ts', 'src/jobs/enqueue.ts']),
    ).toEqual(['src/jobs/client.ts', 'src/jobs/enqueue.ts']);
  });
});

// The third entry, and the other side of "the web process cannot re-key the
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
        'src/rpc.ts',
        'hono',
        '@hono/node-server',
        'ws',
        'src/jobs/worker.ts',
        'src/jobs/register.ts',
      ]),
    ).toEqual([]);
  });
});
