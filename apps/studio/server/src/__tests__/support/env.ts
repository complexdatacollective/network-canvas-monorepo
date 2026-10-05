import { Result, Schema } from 'effect';

// The test harness's own environment boundary, and the only place under
// `src/` besides `src/env.ts` that reads `process.env` — the oxlint
// `node/no-process-env` rule (see the `apps/studio/server/src/**` override in
// .oxlintrc.json) refuses it anywhere else.
//
// The harness needs a flag the server has no business knowing about, so it
// cannot come through `readEnv`: whether this run is CI. That single question
// decides what an unreachable Postgres or Valkey means — a developer without
// the dev stack running, whose suite should skip, or a workflow whose service
// container is missing, which is a broken workflow and must fail.

/**
 * `CI` as a plain string rather than a flag schema. Every CI system sets it,
 * and they do not agree on the value: refusing the ones this harness does not
 * recognise would fail the whole suite at import time on a machine that merely
 * has `CI` set to something unexpected, which is the opposite of what the flag
 * is for.
 */
const HarnessSchema = Schema.Struct({
  CI: Schema.optionalKey(Schema.String),
});

function readHarnessEnv(): typeof HarnessSchema.Type {
  /* oxlint-disable-next-line node/no-process-env -- the test harness's boundary */
  const source: Readonly<Record<string, string | undefined>> = process.env;
  const configured = Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const result = Schema.decodeUnknownResult(HarnessSchema)(configured);
  if (Result.isFailure(result)) {
    throw new Error('the Studio test harness could not read its environment');
  }
  return result.success;
}

const harness = readHarnessEnv();

/**
 * Whether this run is CI, where a missing Postgres or Valkey is a broken
 * workflow rather than a developer's machine. `1` as well as `true`, because
 * both spellings are in the wild and the suites only ever ask the question one
 * way.
 */
export const CI = harness.CI === 'true' || harness.CI === '1';
