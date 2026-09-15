import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

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
const envExampleSource = read('.env.example');

type ComposeService = {
  image?: string;
  environment?: Record<string, string>;
  secrets?: string[];
};
type ComposeFile = {
  services: Record<string, ComposeService>;
  secrets?: Record<string, { file?: string }>;
  configs?: Record<string, { content?: string }>;
};

// Parsed with interpolation left alone: `${VAR}` is a plain string to the YAML
// parser, which is what lets the checks below reason about the references
// themselves rather than about one machine's values for them.
const compose = parse(composeSource) as ComposeFile;
const devCompose = parse(devComposeSource) as ComposeFile;

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
    // environment — and is refused at boot.
    for (const name of ['api', 'worker', 'migrate']) {
      const environment = compose.services[name]!.environment!;
      expect({ name, url: environment.DATABASE_URL }).toEqual({
        name,
        url: 'postgres://${POSTGRES_USER}@postgres:5432/${POSTGRES_DB}',
      });
      expect({ name, file: environment.DATABASE_PASSWORD_FILE }).toEqual({
        name,
        file: '/run/secrets/postgres_password',
      });
    }
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
