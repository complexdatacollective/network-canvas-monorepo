import {
  type ProtocolValidationError,
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
