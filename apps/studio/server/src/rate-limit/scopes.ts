// Every rate limit Studio enforces, and the only place any of them is defined
// (#1909). This is the ruling of 2026-09-15: the limits are constants with a
// single source of truth in one clear location, not deployment settings. There
// is no `RATE_LIMIT_*` environment variable to override them at boot, and
// nothing for a compose file or the self-host guide to offer — the numbers
// below are the numbers every deployment enforces, so reading this file is the
// whole answer to what Studio allows.
//
// Changing one is a code change on purpose. These are security defaults rather
// than capacity settings: a limit a deployer can raise is a limit an attacker
// meets only where nobody raised it, and the failure is silent on the instance
// that raised it. Anything a deployment needs to vary — where the counters
// live — stays configuration; `REDIS_URL` names the store and nothing else.
//
// A scope is a surface plus the kind of subject its bucket is keyed by,
// because those two together are what a limit means: "sign-in, per client
// address" and "sign-in, per email" are different defences against different
// attacks and cannot share a number.
//
// This file imports nothing. The limiter reads it to build keys and log lines
// (src/rate-limit/limiter.ts); the surfaces that enforce a scope name it by
// its `RateLimitScope` — the HTTP route middleware
// (src/http/middleware/rate-limit.ts), the auth mount's per-email sign-in
// check (src/http/auth-mount.ts), the rpc plane
// (src/rate-limit/enforce.ts) and the protocol-builder router
// (src/protocol-builder/router.ts); and better-auth's own sign-in limit takes
// its numbers from `sign_in_address` (src/auth/better-auth.ts). None of those
// may import each other.

/** How many calls the window allows, and how long the window is. */
export type RateLimitRule = { max: number; windowMs: number };

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/**
 * The limits themselves: one entry per scope, its count, its window, and why
 * that number rather than another. They share a shape — a ceiling a legitimate
 * burst never reaches, low enough that the attack the scope exists to stop is
 * not worth running.
 *
 * Written as numbers rather than as the `count/window` strings a deployer used
 * to type, because nobody types them any more: a string would have to be
 * parsed and validated on the way to the only value that matters, and the
 * multiplication below says the same thing with the compiler checking it.
 */
export const RATE_LIMITS = {
  // Ten attempts from one address in ten minutes covers a shared institutional
  // address whose users mistype passwords, and makes credential stuffing from
  // a single host pointless.
  sign_in_address: { max: 10, windowMs: 10 * MINUTE },
  // An account belongs to one person, and a person who has failed five times
  // in ten minutes needs the reset link rather than a sixth attempt. This is
  // the limit an attacker spreading attempts across addresses meets.
  sign_in_email: { max: 5, windowMs: 10 * MINUTE },
  // An invitation is accepted once; ten allows a reload, a wrong account, and
  // a sign-in in between, and stops a token being brute-forced through one
  // link.
  invitation_accept: { max: 10, windowMs: 10 * MINUTE },
  // A lab runs several interviews from one address, so this is deliberately
  // loose; the per-link limit below is what protects a single link. Enforced
  // when the participant routes land (#1899).
  participant_redeem_address: { max: 20, windowMs: 10 * MINUTE },
  // A link is redeemed once, so five covers a reload and a lost response while
  // making a link identifier not worth guessing. Enforced when the participant
  // routes land (#1899).
  participant_redeem_link: { max: 5, windowMs: 10 * MINUTE },
  // Ten writes a second is far above what answering questions produces and far
  // below what a script replaying a session could. Enforced when the
  // participant routes land (#1899).
  participant_sync: { max: 600, windowMs: 1 * MINUTE },
  // The app issues a burst of calls per screen, so this is a ceiling on a
  // runaway client rather than a budget a person can feel: ten calls a second
  // sustained is more than any screen needs.
  rpc_user: { max: 600, windowMs: 1 * MINUTE },
  // A team is many researchers working at once, so this protects the instance
  // rather than the person: five times the per-user limit, which one runaway
  // client cannot reach alone.
  rpc_team: { max: 3000, windowMs: 1 * MINUTE },
  // Generous by design: an interview fetches every stimulus it shows, and an
  // institution often puts a whole building behind one address.
  storage_read: { max: 2000, windowMs: 5 * MINUTE },
  // Five calls a second suits an analysis script paging through results and
  // leaves the instance responsive to everyone else.
  public_api: { max: 300, windowMs: 1 * MINUTE },
  // A tab opens one socket and reopens it when the network drops, so thirty a
  // minute absorbs a flapping connection while stopping a reconnect loop from
  // becoming a connection storm.
  ws_upgrade: { max: 30, windowMs: 1 * MINUTE },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitScope = keyof typeof RATE_LIMITS;

export type RateLimitSettings = Readonly<Record<RateLimitScope, RateLimitRule>>;

/**
 * The scope names, for callers that iterate rather than look one up. Derived
 * from the table rather than written beside it, so the table stays the only
 * list of what Studio limits.
 */
export const RATE_LIMIT_SCOPES = Object.keys(RATE_LIMITS) as RateLimitScope[];
