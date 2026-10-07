import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Duration } from 'effect';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { GRACEFUL_SHUTDOWN_TIMEOUT } from '../platform/http-server.ts';
import { DRAIN_TIMEOUT } from '../platform/ws-drain.ts';

// The drift guard between `apps/studio/docker-compose.yml` and the
// `.env.example` beside it — the two files a self-hoster downloads, and the
// only pair in the repository that nothing else validates. Neither is loaded
// by any code, so a variable renamed in one and not the other, or an image
// left unpinned, would otherwise surface as a failed deployment on someone
// else's host.

const studioRoot = new URL('../../../', import.meta.url);

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, studioRoot)), 'utf8');

const composeSource = read('docker-compose.yml');
const devComposeSource = read('docker-compose.dev.yml');
const localComposeSource = read('docker-compose.local.yml');
const envExampleSource = read('.env.example');

type ComposeService = {
  image?: string;
  command?: string[];
  ports?: string[];
  environment?: Record<string, string>;
  secrets?: string[];
  stop_grace_period?: string;
};
/** A `traefik-api-servers` config, as the file provider reads it. */
type ApiServers = {
  http: {
    services: {
      api: {
        loadBalancer: {
          healthCheck?: { path: string; interval: string; timeout: string };
          servers: { url: string }[];
        };
      };
    };
  };
};
type ComposeFile = {
  services: Record<string, ComposeService>;
  secrets?: Record<string, { file?: string }>;
  configs?: Record<string, { content?: string }>;
};

// Parsed with interpolation left alone: `${VAR}` is a plain string to the YAML
// parser, which is what lets the checks below reason about the references
// themselves rather than about one machine's values for them.
const upgradeOverlaySource = read('release-test/compose.upgrade.yml');

/**
 * The `docker-compose.override.yml` that docs/self-host/run.md gives a
 * self-hoster adding a replica, read from between the markers
 * `stack-test/lib.sh` extracts it from for the two-api variant.
 */
const twoApiOverrideSource =
  /^<!-- two-api-override start -->\n+```yaml\n(?<body>[\s\S]*?)^```\n+<!-- two-api-override end -->$/m.exec(
    read('docs/self-host/run.md'),
  )?.groups?.body ?? '';

/**
 * Every overlay `stack-test/lib.sh` or `release-test/lib.sh` layers over
 * `docker-compose.yml`.
 */
function composeOverlays(): [string, string][] {
  const variants = new URL('stack-test/variants/', studioRoot);
  return [
    ['docker-compose.local.yml', localComposeSource],
    ['release-test/compose.upgrade.yml', upgradeOverlaySource],
    ['docs/self-host/run.md (two-api-override)', twoApiOverrideSource],
    ...readdirSync(fileURLToPath(variants))
      .filter((name) => name.endsWith('.yml'))
      .map((name): [string, string] => [
        name,
        readFileSync(fileURLToPath(new URL(name, variants)), 'utf8'),
      ]),
  ];
}

const compose = parse(composeSource) as ComposeFile;
const devCompose = parse(devComposeSource) as ComposeFile;
const localCompose = parse(localComposeSource) as ComposeFile;

/** Every `${NAME}`, `${NAME:-default}` and `${NAME-default}` in the file. */
function references(source: string): { name: string; hasDefault: boolean }[] {
  const found = new Map<string, boolean>();
  for (const match of source.matchAll(
    /(?<!\$)\$\{([A-Z][A-Z0-9_]*)(:?[-?][^}]*)?\}/g,
  )) {
    const name = match[1]!;
    found.set(name, found.get(name) === true || match[2] !== undefined);
  }
  return [...found].map(([name, hasDefault]) => ({ name, hasDefault }));
}

/** Variables `.env.example` defines, commented-out ones included. */
function declared(source: string): Set<string> {
  return new Set(
    source
      .split('\n')
      .map((line) => /^#?([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1])
      .filter((name): name is string => name !== undefined),
  );
}

describe('the reference compose stack', () => {
  it('is exactly the nine services the stack is specified as', () => {
    // Adding a service is a change to what a self-hoster runs, what the
    // self-host guide documents, and what the platform deploys. Failing here
    // is the prompt to do all three.
    expect(Object.keys(compose.services).sort()).toEqual([
      'api',
      'garage',
      'garage-init',
      'migrate',
      'postgres',
      'traefik',
      'valkey',
      'web',
      'worker',
    ]);
  });

  it('pins every third-party image by tag and digest', () => {
    // A tag can be moved under a running deployment. The two Studio images
    // are the deployment's own choice and come from variables; everything
    // else in the file is pinned here.
    const fromVariable = new Set([
      '${STUDIO_API_IMAGE}',
      '${STUDIO_WEB_IMAGE}',
    ]);
    const unpinned = Object.entries({
      ...compose.services,
      ...devCompose.services,
      ...localCompose.services,
    })
      .filter(([, service]) => service.image !== undefined)
      .filter(
        ([, service]) =>
          !fromVariable.has(service.image!) &&
          !/^[^\s]+:[^\s@]+@sha256:[0-9a-f]{64}$/.test(service.image!),
      )
      .map(([name]) => name);
    expect(unpinned).toEqual([]);
  });

  it('declares every variable it interpolates in the env example', () => {
    const known = declared(envExampleSource);
    const missing = references(composeSource)
      .filter(({ name, hasDefault }) => !hasDefault && !known.has(name))
      .map(({ name }) => name);
    expect(missing).toEqual([]);
  });

  it('interpolates nothing in the development override', () => {
    // It is applied by `scripts/dev.ts`, which supplies the base file's
    // variables from the `DEV` constants. A variable introduced only here
    // would have no source at all.
    expect(references(devComposeSource)).toEqual([]);
  });

  it('leaves the health routes with no middleware in front of them', () => {
    // The deploy script and the container runtime must always read the real
    // status and the named failing check. An error middleware here would
    // report a healthy API during the window in which there is none.
    const dynamic = parse(compose.configs!['traefik-dynamic']!.content!) as {
      http: {
        routers: Record<
          string,
          { rule: string; service: string; middlewares?: string[] }
        >;
      };
    };
    const { health, api, web } = dynamic.http.routers;
    expect(health).toBeDefined();
    expect(health!.middlewares).toBeUndefined();
    expect(health!.rule).toContain('/healthz');
    expect(health!.rule).toContain('/readyz');
    expect(health!.service).toBe('api');
    // The counterpart: the middleware exists and the API's own router carries
    // it, so a passing test above cannot mean it was simply deleted.
    expect(api!.middlewares).toEqual(['maintenance']);
    expect(web!.service).toBe('web');
  });

  it('gives the three Studio processes a database URL with no password in it', () => {
    // The password is the `postgres_password` file secret. A URL that carried
    // one as well would put it in `docker inspect` and in every process
    // environment — and is refused at boot. That holds for the swapped-in
    // managed Postgres too, which is why the default below has no password
    // either.
    for (const name of ['api', 'worker', 'migrate']) {
      const environment = compose.services[name]!.environment!;
      expect({ name, url: environment.DATABASE_URL }).toEqual({
        name,
        url: '${DATABASE_URL:-postgres://${POSTGRES_USER}@postgres:5432/${POSTGRES_DB}}',
      });
      expect({ name, file: environment.DATABASE_PASSWORD_FILE }).toEqual({
        name,
        file: '/run/secrets/postgres_password',
      });
    }
  });

  it('gives the worker time to drain before Docker kills it', () => {
    // The documented drain takes 25-30s; Docker's 10s default would SIGKILL it.
    expect(compose.services.worker!.stop_grace_period).toBe('40s');

    // Every overlay layers on top of the file above, so an overlay that leaves
    // the key alone inherits it. One that sets it must not shorten it.
    for (const [name, source] of composeOverlays()) {
      // logLevel: the overlays carry Compose's own `!override` / `!reset`
      // tags, which the YAML parser does not know and only warns about.
      const overlay = parse(source, { logLevel: 'silent' }) as ComposeFile;
      const worker = overlay.services?.worker;
      // Key presence, not its value: an overlay that never mentions
      // `stop_grace_period` inherits the 40s above, but one that mentions it at
      // all — including to reset it, which Compose spells `!reset` and which
      // hands the worker back Docker's 10s default — has to say 40s itself.
      if (!worker || !('stop_grace_period' in worker)) continue;
      expect({ name, grace: worker.stop_grace_period }).toEqual({
        name,
        grace: '40s',
      });
    }
  });

  it('gives the api time to finish its own shutdown before Docker kills it', () => {
    // The upgrade stops `api` before its backup and relies on the stop
    // finishing the requests already accepted (docs/self-host/upgrade.md,
    // step 2). The server's shutdown is the WebSocket drain, then the
    // listener's graceful close, one after the other; Docker's 10s default is
    // shorter than the two together and would SIGKILL a request partway.
    const shutdownMs =
      Duration.toMillis(DRAIN_TIMEOUT) +
      Duration.toMillis(GRACEFUL_SHUTDOWN_TIMEOUT);
    const graceOf = (value: string | undefined) => {
      const seconds = /^(\d+)s$/.exec(value ?? '')?.[1];
      return seconds === undefined ? null : Number(seconds) * 1000;
    };
    expect(compose.services.api!.stop_grace_period).toBe('20s');
    expect(graceOf(compose.services.api!.stop_grace_period)).toBeGreaterThan(
      shutdownMs,
    );

    // As for the worker: an overlay that mentions the key must say 20s.
    for (const [name, source] of composeOverlays()) {
      const overlay = parse(source, { logLevel: 'silent' }) as ComposeFile;
      const api = overlay.services?.api;
      if (!api || !('stop_grace_period' in api)) continue;
      expect({ name, grace: api.stop_grace_period }).toEqual({
        name,
        grace: '20s',
      });
    }
  });

  it('lets the upgrade lane add nothing to the stack but a loopback database port', () => {
    // The lane's claim is that it upgrades the reference stack with the
    // guide's commands. An overlay that replaced an image, a command or a
    // service would make that claim about a different stack, so the overlay is
    // held to the one thing the seed needs: Postgres reachable from this host,
    // and from nowhere else.
    const overlay = parse(upgradeOverlaySource) as ComposeFile;
    expect(Object.keys(overlay)).toEqual(['services']);
    expect(overlay.services).toEqual({
      postgres: { ports: ['127.0.0.1:55433:5432'] },
    });
  });

  it('lets the three swappable backing services be swapped from .env alone', () => {
    // The specification's "one service block and one set of variables": each
    // of these defaults to the stack's own service, so pointing Studio at a
    // managed Postgres, bucket or Redis is a line in `.env` and not an edit to
    // the file a self-hoster downloaded. Hard-coding one back would make the
    // documented swap require a patched compose file.
    const withDefault = new Map(
      references(composeSource).map(({ name, hasDefault }) => [
        name,
        hasDefault,
      ]),
    );
    for (const name of ['DATABASE_URL', 'REDIS_URL', 'S3_ENDPOINT']) {
      expect({ name, referencedWithDefault: withDefault.get(name) }).toEqual({
        name,
        referencedWithDefault: true,
      });
    }
  });

  it('restates the whole Traefik command in the dev:stack override', () => {
    // A Compose override REPLACES a command list rather than appending to it,
    // so `docker-compose.local.yml` has to carry every flag the production
    // file sets. A flag added there and not here would simply be missing from
    // `dev:stack` — the lane whose job is to run what a self-hoster runs.
    const production = compose.services.traefik!.command!;
    const local = localCompose.services.traefik!.command!;
    const CA_SERVER =
      '--certificatesResolvers.le.acme.caServer=https://127.0.0.1:9/directory';

    // The one deliberate difference: a certificate authority that does not
    // answer, so Traefik falls back to its own self-signed certificate rather
    // than asking Let's Encrypt for `localhost`.
    expect(local).toContain(CA_SERVER);
    expect(production).not.toContain(CA_SERVER);
    expect(local.filter((flag) => flag !== CA_SERVER)).toEqual(production);
  });

  it('publishes nothing in the dev:stack override on a port the dev lane holds', () => {
    // The two lanes run side by side. The stack takes 80 and 443, which the
    // development lane does not use; anything the override publishes has to
    // stay off the development lane's fixed ports, which is why its Mailpit
    // asks for an ephemeral one.
    const devPorts = new Set(
      Object.values(devCompose.services).flatMap((service) =>
        (service.ports ?? []).map((mapping) => mapping.split(':').at(-2)),
      ),
    );
    const collisions = Object.entries(localCompose.services).flatMap(
      ([name, service]) =>
        (service.ports ?? [])
          .filter((mapping) => devPorts.has(mapping.split(':').at(-2)))
          .map((mapping) => `${name}: ${mapping}`),
    );
    expect(collisions).toEqual([]);
  });

  it('introduces no variable of its own in the dev:stack override', () => {
    // `scripts/dev-stack.ts` writes `.env.local` from the base file's
    // variables. One that appeared only in the override would have no source.
    const known = new Set(references(composeSource).map(({ name }) => name));
    const stray = references(localComposeSource)
      .map(({ name }) => name)
      .filter((name) => !known.has(name));
    expect(stray).toEqual([]);
  });

  it('gives Traefik one api server, with no health check, in a file of its own', () => {
    // The server list is its own config so a second replica replaces that
    // file alone (docs/self-host/run.md). With one server a health check could
    // only take it out of rotation and serve the maintenance page instead.
    const traefik: {
      command: string[];
      configs: { source: string; target: string }[];
    } = parse(composeSource).services.traefik;
    expect(traefik.command).toContain(
      '--providers.file.directory=/etc/traefik/dynamic',
    );
    expect(traefik.configs).toEqual([
      { source: 'traefik-dynamic', target: '/etc/traefik/dynamic/routing.yml' },
      {
        source: 'traefik-api-servers',
        target: '/etc/traefik/dynamic/api-servers.yml',
      },
    ]);
    const servers: ApiServers = parse(
      compose.configs!['traefik-api-servers']!.content!,
    );
    expect(servers).toEqual({
      http: {
        services: {
          api: { loadBalancer: { servers: [{ url: 'http://api:3000' }] } },
        },
      },
    });
  });

  it('adds a second replica in the guide with the base api and a liveness check', () => {
    expect(twoApiOverrideSource).not.toBe('');
    const override: {
      services: Record<string, { extends?: { file: string; service: string } }>;
      configs: Record<string, { content: string }>;
    } = parse(twoApiOverrideSource);
    // `extends`, so the replica is the base file's `api` with nothing changed
    // but its name, and its name starts with `api` because the upgrade and
    // restore commands find replicas that way.
    expect(override.services).toEqual({
      'api-b': { extends: { file: 'docker-compose.yml', service: 'api' } },
    });
    expect(Object.keys(override.configs)).toEqual(['traefik-api-servers']);
    const servers: ApiServers = parse(
      override.configs['traefik-api-servers']!.content,
    );
    // `/healthz`, not `/readyz`: readiness fails on every replica at once
    // during maintenance or a database outage.
    expect(servers).toEqual({
      http: {
        services: {
          api: {
            loadBalancer: {
              healthCheck: { path: '/healthz', interval: '5s', timeout: '3s' },
              servers: [
                { url: 'http://api:3000' },
                { url: 'http://api-b:3000' },
              ],
            },
          },
        },
      },
    });
  });

  it('carries the two file secrets and no others', () => {
    expect(compose.secrets).toEqual({
      postgres_password: { file: './secrets/postgres-password' },
      studio_secrets_key: { file: './secrets/studio-secrets-key' },
    });
    const used = new Set(
      Object.values(compose.services).flatMap(
        (service) => service.secrets ?? [],
      ),
    );
    expect([...used].sort()).toEqual([
      'postgres_password',
      'studio_secrets_key',
    ]);
  });
});
