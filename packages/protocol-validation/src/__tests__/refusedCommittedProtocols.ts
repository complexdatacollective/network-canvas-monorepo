import { expect } from 'vitest';

import { MigrationResultInvalidError } from '../migration/errors.ts';
import { STAGE_LABEL_MAX_LENGTH } from '../schemas/9/stages/base.ts';

const STAGE_NAME_TOO_LONG = `but a stage name may be at most ${STAGE_LABEL_MAX_LENGTH}.`;

/**
 * Committed real protocols that schema 9 refuses on purpose, by their path
 * from the repository root, with the text every issue they are refused for
 * carries. Each is refused for exactly that reason and nothing else, so a new
 * problem in one of them still fails the corpus tests that read this.
 *
 * Network Canvas does not shorten a stage name: its researcher does, in the
 * version of Architect that made the protocol. These are not edited here.
 */
const REFUSED_COMMITTED_PROTOCOLS: Readonly<Record<string, string>> = {
  'apps/networkcanvas.com/public/protocols/protocol-gallery/GATE_10-22-2025.netcanvas':
    STAGE_NAME_TOO_LONG,
  'apps/networkcanvas.com/public/protocols/protocol-gallery/ROBUST_10-22-2025.netcanvas':
    STAGE_NAME_TOO_LONG,
  'apps/networkcanvas.com/public/protocols/protocol-gallery/SNAAPS_v1.0.netcanvas':
    STAGE_NAME_TOO_LONG,
  'apps/networkcanvas.com/public/protocols/protocol-gallery/Test-to-PrEP_10-22-2025.netcanvas':
    STAGE_NAME_TOO_LONG,
  'packages/protocols/documentation/protocols/SB21_workshop_protocol_2alterDemo.netcanvas':
    STAGE_NAME_TOO_LONG,
};

/**
 * Asserts that `migrate` is refused as `REFUSED_COMMITTED_PROTOCOLS` says the
 * protocol at `file` is, and whether it was one of them: a test of the
 * corpus stops there for such a protocol.
 */
export const expectCommittedRefusal = (
  file: string,
  migrate: () => unknown,
): boolean => {
  const expected = REFUSED_COMMITTED_PROTOCOLS[file.split('\\').join('/')];
  if (expected === undefined) return false;
  let refusal: unknown;
  try {
    migrate();
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(MigrationResultInvalidError);
  const issues = JSON.parse(
    (refusal instanceof Error ? refusal.message : '').replace(
      'Migration resulted in invalid protocol: ',
      '',
    ),
  ) as { message: string }[];
  expect(issues.length).toBeGreaterThan(0);
  for (const issue of issues) expect(issue.message).toContain(expected);
  return true;
};
