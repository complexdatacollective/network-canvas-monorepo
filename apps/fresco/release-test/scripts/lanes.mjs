// The lane table, for the Node-side harness scripts.
//
// up.sh owns the same table in bash — it is the thing that actually starts the
// stacks — and every driver here has to agree with it: a driver that dialled
// the wrong port would test a lane it was not pointed at, or nothing at all.
// Duplication is unavoidable across the two languages, so it is bound instead:
// `scripts/release-test/fresco-release-test-harness.test.mjs` parses up.sh and
// fails when the two drift.
//
// Kept free of side effects so it can be imported by anything, including the
// tests, without opening a socket or reading a container.

/** @typedef {'upgrade'|'fresh'|'analytics'|'twofactor'} Lane */

export const LANES = {
  upgrade: {
    project: 'fresco-release-test-upgrade',
    frescoPort: 3210,
    postgresPort: 5533,
    minioPort: 9310,
    sinkHttpsPort: 9440,
    sinkHttpPort: 9450,
    analytics: false,
    requireTwoFactor: false,
  },
  fresh: {
    project: 'fresco-release-test-fresh',
    frescoPort: 3211,
    postgresPort: 5534,
    minioPort: 9311,
    sinkHttpsPort: 9441,
    sinkHttpPort: 9451,
    analytics: false,
    requireTwoFactor: false,
  },
  analytics: {
    project: 'fresco-release-test-analytics',
    frescoPort: 3212,
    postgresPort: 5535,
    minioPort: 9312,
    sinkHttpsPort: 9442,
    sinkHttpPort: 9452,
    analytics: true,
    requireTwoFactor: false,
  },
  twofactor: {
    project: 'fresco-release-test-twofactor',
    frescoPort: 3213,
    postgresPort: 5536,
    minioPort: 9313,
    sinkHttpsPort: 9443,
    sinkHttpPort: 9453,
    analytics: false,
    requireTwoFactor: true,
  },
};

/**
 * The lane's configuration, or a loud failure.
 *
 * Never a default: a driver run against a lane name nobody defined must stop,
 * not quietly exercise the upgrade lane and report its findings as another
 * lane's.
 */
export function lane(name) {
  const config = Object.hasOwn(LANES, name) ? LANES[name] : undefined;
  if (!config)
    throw new Error(
      `unknown lane "${name}" — expected one of ${Object.keys(LANES).join(', ')}`,
    );
  return { name, baseUrl: `http://localhost:${config.frescoPort}`, ...config };
}

/** The Fresco container of a lane, for `docker exec` / `docker inspect`. */
export const frescoContainer = (name) => `${lane(name).project}-fresco-1`;

/** The Postgres container of a lane, for verification queries. */
export const postgresContainer = (name) => `${lane(name).project}-postgres-1`;
