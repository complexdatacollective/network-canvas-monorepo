// What Studio rate-limits, named once (#1909). A scope is a surface plus the
// kind of subject its bucket is keyed by, because those two together are what
// a limit means: "sign-in, per client address" and "sign-in, per email" are
// different defences against different attacks and cannot share a number.
//
// It imports nothing. The environment layer reads it to know which variables
// to resolve (src/env/resolve.ts), the limiter to build keys and log lines
// (src/rate-limit.ts), and the summary job to name what it counted — and none
// of those may import each other.

export const RATE_LIMIT_SCOPES = [
  'sign_in_address',
  'sign_in_email',
  'invitation_accept',
  'participant_redeem_address',
  'participant_redeem_link',
  'participant_sync',
  'rpc_user',
  'rpc_team',
  'storage_read',
  'public_api',
  'ws_upgrade',
] as const;

export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[number];

/** How many calls the window allows, and how long the window is. */
export type RateLimitRule = { max: number; windowMs: number };

export type RateLimitSettings = Readonly<Record<RateLimitScope, RateLimitRule>>;

/**
 * `count/window`, where the window is a whole number of seconds, minutes or
 * hours: `10/10m`, `5/30s`, `2000/1h`. A deployer reads and writes limits far
 * more often than any other variable in the catalogue, and two numbers with a
 * unit is the shape they already expect from every other rate limit they have
 * configured.
 */
export const RATE_LIMIT_SPEC_PATTERN = /^[1-9]\d*\/[1-9]\d*[smh]$/;

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000 } as const;

/**
 * Parsed rather than trusted, because the same string reaches this from the
 * catalogue's own defaults and from a deployment's environment, and only the
 * second of those has been through the schema in `variables.ts`.
 */
export function parseRateLimitSpec(spec: string): RateLimitRule {
  if (!RATE_LIMIT_SPEC_PATTERN.test(spec)) {
    throw new Error(
      `invalid rate limit ${JSON.stringify(spec)}: expected count/window, e.g. 10/10m`,
    );
  }
  const [count, window] = spec.split('/') as [string, string];
  const unit = window.at(-1) as keyof typeof UNIT_MS;
  return {
    max: Number(count),
    windowMs: Number(window.slice(0, -1)) * UNIT_MS[unit],
  };
}
