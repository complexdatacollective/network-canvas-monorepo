import {
  ProtocolValidationError,
  repairConfigurationConflicts,
  validateProtocol,
} from '@codaco/protocol-validation';

import type { StoredProtocolRow } from './assetDB';
import { markStoredProtocolValidated } from './protocolLibrary';

export type StoredProtocolAdmissionResult =
  | { success: true }
  | { success: false; error: ProtocolValidationError };

type AdmissionDependencies = {
  validate?: typeof validateProtocol;
  markValidated?: typeof markStoredProtocolValidated;
};

// Current canonical rows carry provenance and open without repeat validation.
// Rows created before the valid-commit boundary are unmarked, so validate them
// once before they can seed an editor session or a revert baseline.
export const admitStoredProtocol = async (
  row: StoredProtocolRow,
  dependencies: AdmissionDependencies = {},
): Promise<StoredProtocolAdmissionResult> => {
  // Configuration conflicts are checked on EVERY open, including a row the
  // library already marked validated: that mark records that the protocol
  // passed the rules of the Architect that wrote it, and the rules about which
  // variables an interface owns are newer. Without this the fast path admits a
  // protocol that fails on the researcher's first commit — a far more common
  // dead end than the one this whole change exists to remove. The check is a
  // single pure walk, so it costs a validated row nothing when it is clean.
  const conflicts = repairConfigurationConflicts(row.protocol);
  if (conflicts.problems.length > 0) {
    const issues = conflicts.problems.map((problem) => ({
      code: 'custom' as const,
      path: [],
      message: problem.problem,
    }));
    // This message is also what the startup session restore reports, where no
    // dialog can be shown and the session is settled on the start screen. Say
    // there that the protocol can be fixed, or the researcher is told what is
    // broken and left to discover the repair by chance.
    if (conflicts.repairable) {
      issues.push({
        code: 'custom' as const,
        path: [],
        message:
          'Open this protocol from your list of protocols to have Architect fix these problems for you.',
      });
    }
    return { success: false, error: new ProtocolValidationError(issues) };
  }

  if (row.validated) return { success: true };

  const result = await (dependencies.validate ?? validateProtocol)(
    row.protocol,
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }

  await (dependencies.markValidated ?? markStoredProtocolValidated)(row);
  return { success: true };
};
