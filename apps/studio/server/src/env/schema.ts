import {
  Predicate,
  Result,
  Schema,
  type SchemaAST as AST,
  SchemaGetter,
  SchemaIssue,
} from 'effect';

import { DEPLOYMENT_MODES } from '@codaco/studio-rpc/surfaces';

// Every environment variable the Studio server reads, declared once: what it
// must look like, what it means, what a deployment does with it, and what the
// development lane and the deployer template say about it. The schema is the
// only declaration — `scripts/env-docs.ts` renders `.env.development`,
// `.env.example` and the README table by walking it (through
// `describeEnvironment` below), and `src/env/resolve.ts` takes what it decodes.
//
// Deliberately NO values anywhere in this file — not as defaults, and not as
// documentation either. `src/env.ts` imports this module, so anything written
// here is compiled into the production server bundle, which is how the
// publicly-known development auth secret once shipped inside a built
// deployable. The two kinds of value therefore live elsewhere: what the
// development lane runs on is `DEV_ENVIRONMENT` in `./development.ts`, which
// only the generator and the dev scripts import and which is written to the
// committed `.env.development` that no deployment path loads; the fallbacks a
// deployment gets when it says nothing are in `resolve.ts`, as ordinary code.
// The `example` placeholders are here because they are deliberately fake —
// nothing can run on them.

/**
 * What a variable carries besides its shape and Effect's own `description`,
 * as annotations on its own schema. Effect's annotation record is keyed by
 * string alone, so the namespace lives in the key text rather than in a
 * symbol: that is what keeps these clear of anything Effect writes there, and
 * a string is the same key in every module registry, which matters because
 * vitest gives each test file its own.
 */
const GroupAnnotationKey = '@codaco/studio-server/env/group';
const DeploymentAnnotationKey = '@codaco/studio-server/env/deployment';
const ExampleAnnotationKey = '@codaco/studio-server/env/example';

export const GROUPS = [
  'Process',
  'Object storage',
  'Database',
  'Secrets',
  'Authentication',
  'Rate limiting',
] as const;

export type Group = (typeof GROUPS)[number];

type VariableDoc = {
  group: Group;
  /** One sentence, and the schema's `description` annotation. */
  summary: string;
  /** What happens in a real deployment when it is set, and when it is not. */
  deployment: string;
  /**
   * Obviously-fake placeholder written to `.env.example`, commented out.
   * Never a development value — a guard in `__tests__/docs.test.ts` enforces
   * that the deployer template contains none of `DEV_ENVIRONMENT`'s values.
   */
  example?: string;
  /**
   * What a deployer is told when the value does not decode, replacing the
   * message Effect would compose. Effect's default names the value it
   * rejected, and half of these variables are credentials: a refusal that
   * quotes `BETTER_AUTH_SECRET` or a `DATABASE_URL`'s password writes it into
   * the boot log of every container that restarts. Omitted means the shared
   * building block below supplies one.
   */
  refusal?: string;
};

/**
 * One variable: its shape, annotated with its documentation, and optional
 * because every Studio variable is — an unconfigured surface refuses at
 * request time rather than stopping the server from booting, and which
 * combinations are allowed is `resolve.ts`'s business rather than the
 * schema's.
 *
 * `optionalKey` keeps `undefined` out of the decoded type, so a variable is
 * either absent or a value. `decodeEnvironment` drops absent and empty
 * variables before decoding, which is what makes that true of a real
 * environment.
 */
function variable<S extends Schema.Top>(schema: S, doc: VariableDoc) {
  const { refusal } = doc;
  return Schema.optionalKey(
    schema.annotate({
      description: doc.summary,
      ...(refusal === undefined ? {} : refuses(refusal)),
      [GroupAnnotationKey]: doc.group,
      [DeploymentAnnotationKey]: doc.deployment,
      ...(doc.example === undefined
        ? {}
        : { [ExampleAnnotationKey]: doc.example }),
    }),
  );
}

/**
 * A refusal that names the variable and what it must be, and never the value.
 * A `message` annotation replaces the whole message Effect would otherwise
 * compose, so nothing of the rejected input survives into it.
 */
const refuses = (expectation: string) => ({ message: expectation });

const NonEmptyString = Schema.String.check(
  Schema.isMinLength(1, refuses('must not be empty')),
);

/**
 * A URL whose scheme is one of these. Checked with the parser rather than a
 * pattern because the failure a bare `host:port` causes is invisible: it
 * parses as a URL whose scheme is the hostname, and the client built from it
 * fails far from the misconfiguration.
 */
function urlWithScheme(schemes: readonly string[], expectation: string) {
  const allowed = new Set(schemes.map((scheme) => `${scheme}:`));
  return Schema.String.check(
    Schema.makeFilter<string>((value) => {
      try {
        return allowed.has(new URL(value).protocol);
      } catch {
        return false;
      }
    }, refuses(expectation)),
  );
}

const HttpUrl = urlWithScheme(
  ['http', 'https'],
  'must be an http:// or https:// URL',
);

/** A TCP port, from `min` so the worker's health listener can exclude 0. */
const port = (min: number) => {
  // The same refusal on both checks, and the first one aborting: every check
  // in a list runs under `errors: 'all'`, so a value that fails both — any
  // non-numeric one, which decodes to NaN — would otherwise be refused twice
  // in identical words.
  const refusal = refuses(`must be a whole number between ${min} and 65535`);
  return Schema.NumberFromString.check(
    Schema.isInt(refusal).abort(),
    Schema.isBetween({ minimum: min, maximum: 65535 }, refusal),
  );
};

/**
 * A yes/no variable. The four spellings a deployer actually writes, and no
 * more: `z.stringbool()`, which this replaces, also accepted `yes`, `on`, `y`
 * and `enabled` and their opposites, none of which is documented anywhere or
 * written by the compose stack.
 */
const Flag = Schema.Literals(['true', 'false', '1', '0'])
  // Annotated before the transform: a value the deployer wrote is refused on
  // the encoded side, and a refusal annotated on the decoded `Boolean` would
  // never be reached.
  .annotate(refuses('must be true, false, 1 or 0'))
  .pipe(
    Schema.decodeTo(Schema.Boolean, {
      decode: SchemaGetter.transform(
        (value) => value === 'true' || value === '1',
      ),
      encode: SchemaGetter.transform((value) => (value ? 'true' : 'false')),
    }),
  );

export const EnvironmentSchema = Schema.Struct({
  NODE_ENV: variable(
    Schema.Literals(['development', 'test', 'production']).annotate(
      refuses('must be development, test or production'),
    ),
    {
      group: 'Process',
      summary:
        'Runtime mode. Anything other than `production` leaves development affordances available.',
      deployment: 'Set to `production` by the `studio-api` image.',
      example: 'production',
    },
  ),

  /**
   * Set only by the committed `.env.development`, which the dev script loads
   * and no deployment path does. It — not `NODE_ENV` — is what activates the
   * development conveniences (console mailer, and tolerating a stray
   * `EMAIL_FROM`), so a deployment that forgot `NODE_ENV=production` still
   * cannot run with them.
   */
  STUDIO_DEV_DEFAULTS: variable(Flag, {
    group: 'Process',
    summary:
      'Marks the process as running against the committed development defaults.',
    deployment:
      'Never set. It is refused at boot unless `NODE_ENV` is `development` or `test`.',
  }),

  PORT: variable(port(0), {
    group: 'Process',
    summary: 'TCP port the HTTP server listens on.',
    deployment: 'Unset ⇒ 3000.',
    example: '3000',
  }),

  HOST: variable(NonEmptyString, {
    group: 'Process',
    summary: 'Interface the HTTP server binds to.',
    deployment: 'Unset ⇒ `0.0.0.0`.',
    example: '0.0.0.0',
  }),

  /**
   * Port 0 is excluded deliberately, unlike `PORT`: a container healthcheck
   * has to name the port it polls, and an ephemeral one could not be named.
   */
  WORKER_HEALTH_PORT: variable(port(1), {
    group: 'Process',
    summary:
      'TCP port the worker process serves `/healthz` and `/readyz` on, bound to `127.0.0.1` only.',
    deployment:
      'Unset ⇒ 3001. The worker routes no traffic, so this listener exists for the container healthcheck and is never published or proxied; the address it binds is fixed in code, not configurable. The web process ignores it and serves the same two routes on `PORT`.',
    example: '3001',
  }),

  /**
   * Declared ahead of the reporting it governs (#1897) so the development lane
   * can carry the opt-out from the start and no deployment ever meets a
   * version of Studio that reports before the variable existed. Unset resolves
   * to `true` in `resolve.ts`.
   */
  STUDIO_TELEMETRY: variable(Flag, {
    group: 'Process',
    summary:
      'Whether this instance reports anonymous usage telemetry. Declared here so the development lane can turn it off; nothing reads it until #1897 builds the reporting it governs.',
    deployment:
      'Unset ⇒ true. Set to `false` to opt an instance out. It does not govern the update check (#1901), which is not configurable and is blocked at the firewall instead.',
    example: 'true',
  }),

  /**
   * Read at run time by every entrypoint, so the managed deployment sets it in
   * the container environment rather than at build time. Unset resolves to
   * `self-hosted` in `resolve.ts` — the fail-closed direction, and the reason
   * the default cannot live here.
   */
  STUDIO_DEPLOYMENT_MODE: variable(
    Schema.Literals(DEPLOYMENT_MODES).annotate(
      refuses('must be managed or self-hosted'),
    ),
    {
      group: 'Process',
      summary:
        'Which topology this deployment serves: `managed` (marketing, pricing, sign-up, billing) or `self-hosted` (first-run setup). The other topology’s paths are refused with 404.',
      deployment:
        'Unset ⇒ `self-hosted`. The managed deployment sets `managed` in the container environment, at run time rather than at build time, because every entrypoint reads it inside the running process.',
      example: 'self-hosted',
    },
  ),

  S3_ENDPOINT: variable(HttpUrl, {
    group: 'Object storage',
    summary: 'S3-compatible endpoint holding content-addressed asset bytes.',
    deployment: 'Required with the other four `S3_*` variables.',
    example: 'https://s3.us-east-1.amazonaws.com',
  }),
  S3_REGION: variable(NonEmptyString, {
    group: 'Object storage',
    summary: 'Region passed to the S3 client.',
    deployment: 'Required with the other four `S3_*` variables.',
    example: 'us-east-1',
  }),
  S3_BUCKET: variable(NonEmptyString, {
    group: 'Object storage',
    summary: 'Bucket asset objects are written to and read from.',
    deployment: 'Required with the other four `S3_*` variables.',
    example: 'studio-assets',
  }),
  S3_ACCESS_KEY_ID: variable(NonEmptyString, {
    group: 'Object storage',
    summary: 'Access key for the object store.',
    deployment: 'Required with the other four `S3_*` variables.',
  }),
  S3_SECRET_ACCESS_KEY: variable(NonEmptyString, {
    group: 'Object storage',
    summary: 'Secret key for the object store.',
    deployment: 'Required with the other four `S3_*` variables.',
  }),

  DATABASE_URL: variable(NonEmptyString, {
    group: 'Database',
    summary: 'Postgres connection string, `pg.Pool`’s native format.',
    deployment:
      'Unset ⇒ no database; auth and sync refuse while the server still boots. The login owns the schema and needs `CREATEROLE` the first time `apply-schema` runs; the server runs as the `studio_app` role it creates. A connection string carrying an `options` parameter is refused at boot: node-postgres would let it override the `role=` every pool pins itself with, and both processes would run as the login instead.',
    example: 'postgres://user@host:5432/studio',
  }),

  /**
   * A Compose file secret path rather than a value, so the password is in
   * neither `docker inspect` nor the process environment. `resolve.ts` reads
   * the file once and produces the effective connection string from the two.
   */
  DATABASE_PASSWORD_FILE: variable(NonEmptyString, {
    group: 'Database',
    summary:
      'Path of a file holding the password for `DATABASE_URL`, which must then carry none.',
    deployment:
      'How the reference compose stack delivers the database password: a Compose file secret at `/run/secrets/postgres_password`, so it appears neither in `docker inspect` nor in any process environment. The file is read once at boot and its password inserted into `DATABASE_URL`. Setting it while `DATABASE_URL` also carries a password is a boot error — there would be no way to tell which was meant. Trailing newlines are stripped, matching what the Postgres image does with the same file.',
    example: '/run/secrets/postgres_password',
  }),

  /**
   * Shape is not checked here: the parse that produces the keyring
   * (`src/secrets/keyring.ts`) is the only thing that can say whether a value
   * is usable, and it reports what is wrong without ever echoing the value.
   */
  STUDIO_SECRETS_KEY: variable(NonEmptyString, {
    group: 'Secrets',
    summary:
      'The keyring Studio encrypts stored secrets with — webhook signing secrets, API-key protocol assets and OAuth tokens. One or more `<id>:<base64 of 32 bytes>` entries separated by commas or whitespace, the first of which is the one new values are written under.',
    deployment:
      'Required whenever `DATABASE_URL` is set, unless `STUDIO_SECRETS_KEY_FILE` names a file holding it; setting both is refused at boot. Generate an entry with `openssl rand -base64 32` and write it as `k1:<value>`. Back it up with the database: without it every stored secret is unreadable, and the server refuses to start rather than serve a database it can only half read. Rotate by adding a new entry at the front, deploying, running `studio-api rotate-secrets`, and then removing the old entry.',
    example: `k1:${'x'.repeat(43)}=`,
  }),
  STUDIO_SECRETS_KEY_FILE: variable(NonEmptyString, {
    group: 'Secrets',
    summary:
      'Path to a file holding the keyring, read once at boot; the file may put one entry per line.',
    deployment:
      'The reference stack mounts the keyring as a Compose file secret under `/run/secrets`, so it never appears in `docker inspect` or in a log of the environment. Takes the place of `STUDIO_SECRETS_KEY`, which stays for development and for hosts that have no file secrets; setting both is refused at boot.',
    example: '/run/secrets/studio_secrets_key',
  }),

  /**
   * 32 bytes of base64 is 44 characters, so the documented
   * `openssl rand -base64 32` clears the floor comfortably. The floor exists
   * to refuse a placeholder or truncated value at boot rather than let it
   * quietly weaken session and magic-link token signing.
   */
  BETTER_AUTH_SECRET: variable(Schema.String.check(Schema.isMinLength(32)), {
    group: 'Authentication',
    summary: 'Signing secret for sessions and magic-link tokens.',
    deployment:
      'Required whenever `DATABASE_URL` is set. Generate one with `openssl rand -base64 32`.',
    refusal:
      'must be at least 32 characters; generate one with `openssl rand -base64 32`',
  }),

  /**
   * Named `PUBLIC_URL` to match Fresco's name for the same thing, and
   * specifically not `BASE_URL`: Vite-driven runtimes — including vitest —
   * set `process.env.BASE_URL` to `/`, which would silently shadow the real
   * configuration.
   */
  PUBLIC_URL: variable(HttpUrl, {
    group: 'Authentication',
    summary:
      'The browser-facing origin. Cookies, magic-link URLs, and team-invitation URLs are minted against it.',
    deployment: 'Required whenever `DATABASE_URL` is set.',
    example: 'https://studio.example.org',
  }),
  SMTP_URL: variable(NonEmptyString, {
    group: 'Authentication',
    summary:
      'SMTP transport sign-in and team-invitation email is sent through.',
    deployment:
      'Read by the worker process, which sends every message Studio sends; the web process never reads it. Unset ⇒ the worker boots without its mail workers and says so, and sign-in and invitation mail queues until one is configured. A sign-in or invitation link is never written to the log outside development.',
    example: 'smtp://user:password@smtp.example.org:587',
  }),
  EMAIL_FROM: variable(NonEmptyString, {
    group: 'Authentication',
    summary: 'From address on sign-in and team-invitation email.',
    deployment:
      'Read by the worker process alongside `SMTP_URL`: required with it, and refused without it.',
    example: 'studio@studio.example.org',
  }),
  GOOGLE_CLIENT_ID: variable(NonEmptyString, {
    group: 'Authentication',
    summary: 'OAuth client ID for "Continue with Google" sign-in (#1255).',
    deployment:
      'Required with `GOOGLE_CLIENT_SECRET`; unset ⇒ Google sign-in is not offered. Create a Web application OAuth client in the Google Cloud Console with `<PUBLIC_URL>/api/auth/callback/google` as an authorized redirect URI.',
    example: 'xxxxxxxx.apps.googleusercontent.com',
  }),
  GOOGLE_CLIENT_SECRET: variable(NonEmptyString, {
    group: 'Authentication',
    summary: 'OAuth client secret paired with `GOOGLE_CLIENT_ID`.',
    deployment: 'Required with `GOOGLE_CLIENT_ID`, and refused without it.',
    example: 'GOCSPX-xxxxxxxxxxxxxxxx',
  }),
  MICROSOFT_CLIENT_ID: variable(NonEmptyString, {
    group: 'Authentication',
    summary:
      'Entra application (client) ID for "Continue with Microsoft" sign-in (#1255).',
    deployment:
      'Required with `MICROSOFT_CLIENT_SECRET`; unset ⇒ Microsoft sign-in is not offered. Register an application in Microsoft Entra with `<PUBLIC_URL>/api/auth/callback/microsoft` as a Web redirect URI.',
    example: '00000000-0000-0000-0000-000000000000',
  }),
  MICROSOFT_CLIENT_SECRET: variable(NonEmptyString, {
    group: 'Authentication',
    summary: 'Client secret paired with `MICROSOFT_CLIENT_ID`.',
    deployment: 'Required with `MICROSOFT_CLIENT_ID`, and refused without it.',
    example: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  }),
  MICROSOFT_TENANT_ID: variable(NonEmptyString, {
    group: 'Authentication',
    summary:
      'Entra tenant to accept sign-ins from, for single-tenant registrations.',
    deployment:
      'Unset ⇒ `common` (any organizational or personal Microsoft account, matching a multitenant registration). Refused without the other two `MICROSOFT_*` variables.',
    example: 'contoso.onmicrosoft.com',
  }),

  /**
   * Read only by the seed command. The floor refuses a placeholder: this is
   * the one credential that opens every seeded team.
   */
  STUDIO_SEED_ADMIN_PASSWORD: variable(
    Schema.String.check(Schema.isMinLength(12)),
    {
      group: 'Authentication',
      summary:
        'Password of the `admin@studio.test` account the `seed` command creates, which owns every seeded team.',
      deployment:
        'Read only by `seed` and `db:reset`. Required to seed a non-local database: the published development password is refused there, because it is a working credential on any instance that keeps it. Unset ⇒ the development password, for local databases only.',
      example: 'a-long-random-value-chosen-for-this-instance',
      refusal: 'must be at least 12 characters',
    },
  ),

  /**
   * The shared rate-limit store (#1909). Every limit Studio enforces counts
   * here rather than in process memory, which is what makes a limit mean the
   * same thing with one API container and with two.
   */
  REDIS_URL: variable(
    urlWithScheme(['redis', 'rediss'], 'must be a redis:// or rediss:// URL'),
    {
      group: 'Rate limiting',
      summary:
        'Redis 7-compatible server (the reference stack runs Valkey) holding every rate-limit counter.',
      deployment:
        'Unset ⇒ there is no limiter store, every limit is disabled, and the server says so once at boot outside development. The reference compose stack always sets it. Any Redis 7-compatible server will do — the limiter uses `EVAL`, sorted sets and hashes and nothing else — and the counters are disposable: losing them resets every window rather than losing data. It is the only part of rate limiting a deployment configures: the limits themselves are constants in `src/rate-limit/scopes.ts` and are not settings.',
      example: 'redis://valkey:6379',
    },
  ),

  TRUSTED_PROXIES: variable(
    Schema.String.pipe(
      Schema.decodeTo(Schema.mutable(Schema.Array(Schema.String)), {
        decode: SchemaGetter.transform((value) =>
          value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
        encode: SchemaGetter.transform((entries) => entries.join(',')),
      }),
    ),
    {
      group: 'Authentication',
      summary:
        'Comma-separated proxy addresses or CIDRs whose `X-Forwarded-For` may be trusted when resolving the client IP.',
      deployment:
        'Unset ⇒ forwarded headers are not read at all, which is safe but shares one rate-limit bucket across every client. List only your own proxies, and only where each one overwrites the header rather than appending to a client-supplied value.',
      example: '10.0.0.0/8,192.168.0.0/16',
    },
  ),
}).annotate({ identifier: 'the Studio server environment' });

/** Every variable, decoded: what `resolve.ts` turns into a `StudioEnv`. */
export type EnvironmentVariables = typeof EnvironmentSchema.Type;

export type VariableName = keyof EnvironmentVariables;

/** One variable's documentation, read back out of its annotations. */
export type EnvironmentVariableDoc = VariableDoc & { name: VariableName };

/**
 * A node's annotations together with those of its checks, the node winning.
 * Both have to be read because `annotate` puts an annotation on the last check
 * of a schema that has any and on the node itself only when it has none — so
 * `NODE_ENV` carries its documentation on the node and `PORT` carries its own
 * on the range check.
 */
function annotationsOf(ast: AST.AST): Schema.Annotations.Annotations {
  const fromChecks = (ast.checks ?? []).reduce(
    (merged, check) => ({ ...merged, ...check.annotations }),
    {},
  );
  return { ...fromChecks, ...ast.annotations };
}

function annotation(
  annotations: Schema.Annotations.Annotations,
  key: string,
): string | undefined {
  const value = annotations[key];
  return Predicate.isString(value) ? value : undefined;
}

/**
 * The schema's documentation, flat and in declaration order, for the generator
 * and the guards that check what it generated. Reading it back through the AST
 * rather than keeping a second list beside the schema is what makes the schema
 * the only declaration: a variable cannot be added without its documentation,
 * because this throws rather than emitting a half-documented entry.
 */
export function describeEnvironment(): EnvironmentVariableDoc[] {
  return EnvironmentSchema.ast.propertySignatures.map((property) => {
    const name = String(property.name) as VariableName;
    const annotations = annotationsOf(property.type);
    const group = annotation(annotations, GroupAnnotationKey);
    const summary = annotation(annotations, 'description');
    const deployment = annotation(annotations, DeploymentAnnotationKey);
    if (!group || !summary || !deployment) {
      throw new Error(
        `${name} is missing its group, summary or deployment annotation in src/env/schema.ts`,
      );
    }
    const example = annotation(annotations, ExampleAnnotationKey);
    return {
      name,
      group: group as Group,
      summary,
      deployment,
      ...(example === undefined ? {} : { example }),
    };
  });
}

const decode = Schema.decodeUnknownResult(EnvironmentSchema, { errors: 'all' });

/**
 * Decodes a raw environment, naming every variable it refuses at once rather
 * than the first: a deployment that has three variables wrong should learn all
 * three from one boot, not from three.
 *
 * An empty value means unset, which is how a Compose file's `FOO=` and a
 * cleared variable in a test both read. Effect has no notion of that, so the
 * keys are dropped here, before the decode, where the rule is visible.
 */
export function decodeEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): EnvironmentVariables {
  const configured = Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );

  const result = decode(configured);
  if (Result.isSuccess(result)) return result.success;

  // The default formatter, with every variable's own refusal message replacing
  // what Effect would otherwise compose — so the report names each bad variable
  // and what it should be, and never prints the value it rejected.
  throw new Error(
    `Studio cannot start: the environment is not valid.\n${SchemaIssue.makeFormatterDefault()(
      result.failure.issue,
    )}`,
  );
}
