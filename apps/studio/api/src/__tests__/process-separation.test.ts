import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
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
  modules: Set<string>;
  packages: Set<string>;
};

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

const JOB_EXECUTION = [
  'src/jobs/worker.ts',
  'src/jobs/registrations.ts',
  'src/jobs/handlers/invitation-delivery.ts',
  'src/jobs/handlers/sign-in-email.ts',
  'src/jobs/handlers/protocol-store-gc.ts',
  'src/jobs/handlers/denied-attempts-summary.ts',
];

const ENTRIES = {
  'src/index.ts': './programs/serve.ts',
  'src/worker.ts': './programs/worker.ts',
  'src/migrate.ts': './programs/migrate.ts',
  'src/maintenance.ts': './programs/maintenance.ts',
  'src/rotate-secrets.ts': './programs/rotate-secrets.ts',
} as const;

describe('the import inventory', () => {
  it('follows every form one module reaches another by', () => {
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
    for (const [entry, program] of Object.entries(ENTRIES)) {
      const relativeSpecifiers = moduleSpecifiers(
        readFileSync(resolve(SERVER_ROOT, entry), 'utf8'),
      ).filter((specifier) => specifier.startsWith('.'));
      expect(relativeSpecifiers, entry).toEqual([program]);
    }
  });

  it('reaches @effect/platform-node by subpath only', () => {
    // The package's barrel imports its Redis module, and `redis` is deliberately
    // not installed, so a bare `from '@effect/platform-node'` fails at boot.
    for (const entry of Object.keys(ENTRIES)) {
      const { packages } = moduleGraph(entry);
      expect(packages.has('@effect/platform-node'), entry).toBe(false);
      expect(packages.has('@effect/platform-node/NodeRuntime'), entry).toBe(
        true,
      );
      expect(packages.has('redis'), entry).toBe(false);
    }
  });
  it('reaches no Hono, no oRPC and no WebSocket library of its own', () => {
    const foreign = (name: string) =>
      /^(?:hono|ws)(?:\/|$)/.test(name) || /^@(?:hono|orpc)\//.test(name);
    for (const entry of Object.keys(ENTRIES)) {
      expect([...moduleGraph(entry).packages].filter(foreign), entry).toEqual(
        [],
      );
    }
  });
  it('imports no zod from its own modules', () => {
    const zod = (name: string) => /^zod(?:\/|$)/.test(name);
    for (const entry of Object.keys(ENTRIES)) {
      expect([...moduleGraph(entry).packages].filter(zod), entry).toEqual([]);
    }
  });
});

describe('the worker process', () => {
  const graph = moduleGraph('src/worker.ts');

  it('runs on the Effect driver, with no node-postgres pool', () => {
    expect(reached(graph, ['@effect/sql-pg'])).toEqual(['@effect/sql-pg']);
    expect(
      reached(graph, ['drizzle-orm/node-postgres', 'src/db/pool.ts']),
    ).toEqual([]);
  });

  it('serves nothing but the health routes', () => {
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/protocol-builder/rpc.ts',
        'src/protocol-builder/handlers.ts',
        'src/http/api-v1.ts',
        'src/api/status.ts',
        '@codaco/studio-contract/api/v1',
        '@orpc/server',
        'hono',
        'ws',
      ]),
    ).toEqual([]);
  });

  it('answers the healthcheck from a module that reaches no surface', () => {
    expect(
      reached(graph, [
        'src/http/health.ts',
        '@effect/platform-node/NodeHttpServer',
      ]),
    ).toEqual(['src/http/health.ts', '@effect/platform-node/NodeHttpServer']);
  });

  it('is the process that holds the mail transport', () => {
    expect(
      reached(graph, ['src/mail/live.ts', 'src/mail/smtp.ts', 'nodemailer']),
    ).toEqual(['src/mail/live.ts', 'src/mail/smtp.ts', 'nodemailer']);
  });

  it('is the process that executes jobs', () => {
    expect(reached(graph, JOB_EXECUTION)).toEqual(JOB_EXECUTION);
  });

  it('builds no auth provider at all', () => {
    const isBetterAuth = (name: string) =>
      name === 'better-auth' ||
      name.startsWith('better-auth/') ||
      name.startsWith('@better-auth/');
    expect([...graph.packages].filter(isBetterAuth)).toEqual([]);
    expect(
      [...graph.modules].filter((path) => path.startsWith('src/auth/')),
    ).toEqual([]);

    const web = moduleGraph('src/index.ts');
    expect(
      reached(web, [
        'better-auth',
        'src/auth/service.ts',
        'src/auth/better-auth.ts',
      ]),
    ).toEqual([
      'better-auth',
      'src/auth/service.ts',
      'src/auth/better-auth.ts',
    ]);
  });

  it('is the process that holds the maintenance TeamAccess', () => {
    expect(reached(graph, ['src/jobs/team-access.ts'])).toEqual([
      'src/jobs/team-access.ts',
    ]);
  });
});

function loadedModules(entry: string): Set<string> {
  const loaded = new Set<string>();
  const pending = [realpathSync(resolve(SERVER_ROOT, entry))];
  const followed = (specifier: string) =>
    specifier === 'effect' ||
    specifier.startsWith('effect/') ||
    specifier.startsWith('@effect/') ||
    specifier.startsWith('@codaco/');

  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) break;
    if (loaded.has(file)) continue;
    loaded.add(file);
    const source = readFileSync(file, 'utf8');
    const specifiers = file.includes('/node_modules/')
      ? distSpecifiers(source)
      : runtimeSpecifiers(source);
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        pending.push(realpathSync(resolve(dirname(file), specifier)));
      } else if (followed(specifier)) {
        pending.push(realpathSync(createRequire(file).resolve(specifier)));
      }
    }
  }
  return loaded;
}

function runtimeSpecifiers(source: string): string[] {
  const tokens = sourceTokens(source);
  const specifiers: string[] = [];
  let typeOnly = false;
  for (const [index, token] of tokens.entries()) {
    if (token.raw === 'import' || token.raw === 'export') {
      typeOnly =
        tokens[index + 1]?.raw === 'type' &&
        tokens[index + 2]?.raw !== 'from' &&
        tokens[index + 2]?.raw !== '(';
    }
    if (token.raw !== 'from' && token.raw !== 'import') continue;
    const next = tokens[index + 1];
    const literal =
      next?.raw.startsWith("'") || next?.raw.startsWith('"')
        ? next.value
        : token.raw === 'import' &&
            next?.raw === '(' &&
            (tokens[index + 2]?.raw.startsWith("'") ||
              tokens[index + 2]?.raw.startsWith('"'))
          ? tokens[index + 2]?.value
          : undefined;
    if (literal !== undefined && !(token.raw === 'from' && typeOnly)) {
      specifiers.push(literal);
    }
  }
  return specifiers;
}

function distSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(
      /^(?:(?:import|export)(?![ \t]+type\b)[^'"\n]*?\bfrom[ \t]*|import[ \t]*)["']([^"'\n]+)["']/gm,
    ),
  ].map((match) => match[1] ?? '');
}

const SCALAR =
  /\/effect\/dist\/http-api\/(?:HttpApiScalar|internal\/httpApiScalar)\.js$/;

describe('what each process loads through the packages it imports', () => {
  const loadsScalar = (entry: string) =>
    [...loadedModules(entry)].some((path) => SCALAR.test(path));

  it('keeps the API reference page out of the worker', () => {
    expect(loadsScalar('src/worker.ts')).toBe(false);
  });

  it('keeps it out of the health routes both processes mount', () => {
    expect(loadsScalar('src/http/health.ts')).toBe(false);
  });

  it('loads it in the web process, which serves the page', () => {
    expect(loadsScalar('src/index.ts')).toBe(true);
  });
});

const byName = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const PROTOCOL_BUILDER_HOST =
  /\/src\/protocol-builder\/(?:rpc|handlers|session|leases|presence|publisher)\.ts$/;

const HTTPAPI_BARREL = /\/effect\/dist\/http-api\/index\.js$/;

describe('the protocol-builder host', () => {
  const hostModules = (entry: string) =>
    [...loadedModules(entry)]
      .filter((path) => PROTOCOL_BUILDER_HOST.test(path))
      .map((path) => path.slice(path.indexOf('/src/') + 1))
      .toSorted(byName);

  it('is loaded by the web process alone', () => {
    for (const entry of [
      'src/worker.ts',
      'src/migrate.ts',
      'src/maintenance.ts',
      'src/rotate-secrets.ts',
    ]) {
      expect(hostModules(entry), entry).toEqual([]);
    }
    expect(hostModules('src/index.ts')).toEqual(
      [
        'src/protocol-builder/handlers.ts',
        'src/protocol-builder/leases.ts',
        'src/protocol-builder/presence.ts',
        'src/protocol-builder/publisher.ts',
        'src/protocol-builder/rpc.ts',
        'src/protocol-builder/session.ts',
      ].toSorted(byName),
    );
  });

  it('reaches Effect rpc by subpath, and no WebSocket library of its own', () => {
    expect(
      [...loadedModules('src/protocol-builder/rpc.ts')].filter((path) =>
        HTTPAPI_BARREL.test(path),
      ),
    ).toEqual([]);
    expect(reached(moduleGraph('src/index.ts'), ['ws'])).toEqual([]);
  });
});

describe('the health routes', () => {
  const graph = moduleGraph('src/http/health.ts');

  it('reach neither the app nor the RPC router', () => {
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/protocol-builder/rpc.ts',
        'src/http/api-v1.ts',
        'src/api/status.ts',
        '@codaco/studio-contract/api/v1',
        '@codaco/studio-contract/limits',
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
    expect(
      reached(graph, [
        'drizzle-kit',
        'drizzle-kit/api-postgres',
        'scripts/apply.ts',
      ]),
    ).toEqual([]);
  });

  it('serves nothing', () => {
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/protocol-builder/rpc.ts',
        'hono',
        '@effect/platform-node/NodeHttpServer',
      ]),
    ).toEqual([]);
  });

  it('applies the schema on the Effect driver, with no node-postgres pool', () => {
    expect(
      reached(graph, ['@effect/sql-pg', 'drizzle-orm/effect-postgres']),
    ).toEqual(['@effect/sql-pg', 'drizzle-orm/effect-postgres']);
    expect(
      reached(graph, ['drizzle-orm/node-postgres', 'src/db/pool.ts']),
    ).toEqual([]);
  });
});

describe('the web process', () => {
  const graph = moduleGraph('src/index.ts');

  it('serves through the Effect router', () => {
    expect(
      reached(graph, [
        'src/http/router.ts',
        'src/protocol-builder/rpc.ts',
        'src/http/api-v1.ts',
        'src/api/status.ts',
        'src/app.ts',
        '@effect/platform-node/NodeHttpServer',
      ]),
    ).toEqual([
      'src/http/router.ts',
      'src/protocol-builder/rpc.ts',
      'src/http/api-v1.ts',
      'src/api/status.ts',
      'src/app.ts',
      '@effect/platform-node/NodeHttpServer',
    ]);
  });

  it('loads nothing that executes a job', () => {
    expect(reached(graph, JOB_EXECUTION)).toEqual([]);
  });

  it('holds no mail transport', () => {
    expect(
      reached(graph, ['src/mail/live.ts', 'src/mail/smtp.ts', 'nodemailer']),
    ).toEqual([]);
  });

  it('cannot re-key the database while it is serving it', () => {
    expect(reached(graph, ['src/secrets/rotate.ts'])).toEqual([]);
  });

  it('creates jobs through the one enqueue', () => {
    expect(reached(graph, ['src/jobs/jobs.ts', 'src/jobs/insert.ts'])).toEqual([
      'src/jobs/jobs.ts',
      'src/jobs/insert.ts',
    ]);
  });

  it('runs its commands on the Effect driver', () => {
    expect(
      reached(graph, ['@effect/sql-pg', 'drizzle-orm/effect-postgres']),
    ).toEqual(['@effect/sql-pg', 'drizzle-orm/effect-postgres']);
    expect(
      reached(graph, ['drizzle-orm/node-postgres', 'src/db/pool.ts']),
    ).toEqual([]);
  });

  it('cannot mint a TeamAccess without a membership check', () => {
    expect(
      reached(graph, [
        'src/jobs/team-access.ts',
        'src/audit/denial-summary.ts',
      ]),
    ).toEqual([]);
  });

  it('carries the queue’s schema installer nowhere near it', () => {
    expect(reached(graph, ['src/jobs/install.ts'])).toEqual([]);
  });
});

describe('the maintenance process', () => {
  const graph = moduleGraph('src/maintenance.ts');

  it('writes the flag through the deployment-state store', () => {
    expect(
      reached(graph, [
        'src/db/deployment-state.ts',
        'src/db/client.ts',
        '@effect/sql-pg',
      ]),
    ).toEqual([
      'src/db/deployment-state.ts',
      'src/db/client.ts',
      '@effect/sql-pg',
    ]);
  });

  it('serves nothing and runs no job', () => {
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/http/health.ts',
        'src/http/middleware/maintenance.ts',
        'src/protocol-builder/rpc.ts',
        'hono',
        '@orpc/server',
        '@effect/platform-node/NodeHttpServer',
        'ws',
        'src/jobs/maintenance.ts',
        ...JOB_EXECUTION,
      ]),
    ).toEqual([]);
  });

  it('holds no mail transport, no rotation and no better-auth', () => {
    expect(
      reached(graph, [
        'src/mail/live.ts',
        'src/mail/smtp.ts',
        'nodemailer',
        'src/secrets/rotate.ts',
        'better-auth',
        'src/auth/better-auth.ts',
      ]),
    ).toEqual([]);
  });

  it('carries no node-postgres', () => {
    expect(
      reached(graph, ['pg', 'drizzle-orm/node-postgres', 'src/db/pool.ts']),
    ).toEqual([]);
  });
});

describe('the rotation process', () => {
  const graph = moduleGraph('src/rotate-secrets.ts');

  it('is the process that re-keys the stored secrets', () => {
    expect(reached(graph, ['src/secrets/rotate.ts'])).toEqual([
      'src/secrets/rotate.ts',
    ]);
  });

  it('is the entry already clear of node-postgres', () => {
    expect(reached(graph, ['@effect/sql-pg'])).toEqual(['@effect/sql-pg']);
    expect(
      reached(graph, ['pg', 'drizzle-orm/node-postgres', 'src/db/pool.ts']),
    ).toEqual([]);
  });

  it('serves nothing and runs no job', () => {
    expect(
      reached(graph, [
        'src/app.ts',
        'src/http/router.ts',
        'src/protocol-builder/rpc.ts',
        'hono',
        '@effect/platform-node/NodeHttpServer',
        'ws',
        ...JOB_EXECUTION,
      ]),
    ).toEqual([]);
  });
});

describe('the image', () => {
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
    // module Studio never imports; pnpm-workspace.yaml makes the peer optional
    // through `packageExtensions`.
    expect(
      Object.keys(platformNodeSnapshot().dependencies ?? {}),
    ).not.toContain('redis');
  });
});
