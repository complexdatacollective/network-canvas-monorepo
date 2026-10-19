import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import { APP_SCHEMA_VERSION } from '~/config';

import type { StoredProtocolRow } from './assetDB';
import { markStoredProtocolValidated } from './protocolLibrary';

/**
 * Why a stored row was refused, already shaped as the app's protocol-open
 * result.
 *
 * Both entry points hand this straight to `showProtocolOpenResultDialog` — the
 * library open by returning it as its `ProtocolOpenResult`, the startup
 * restore by queueing it — so a refusal is described once, here, and cannot
 * drift between the two paths. The shapes are structurally the matching
 * members of `ProtocolOpenResult`; the type is declared locally rather than
 * imported so this module stays free of any dependency on the ducks.
 */
export type StoredProtocolRefusal =
  | { status: 'validation-error'; message: string }
  | { status: 'app-upgrade-required'; protocolSchemaVersion: number }
  | { status: 'error'; title: string; message: string; detail?: string };

export type StoredProtocolAdmissionResult =
  | {
      success: true;
      /** The document to open: the row's own, once admitted. */
      protocol: CurrentProtocol;
    }
  | { success: false; refusal: StoredProtocolRefusal };

/**
 * A stored protocol is one the researcher is still writing, so it opens
 * without the closing text it cannot be downloaded without.
 */
const DRAFT = { draft: true } as const;

type AdmissionDependencies = {
  validate?: typeof validateProtocol;
  markValidated?: typeof markStoredProtocolValidated;
};

// Rows are gated on their schema version first, then on validation provenance.
//
// Version first, because provenance is only a claim about the schema that was
// current when the mark was written: a `validated: true` row from an older
// build is proof of nothing under this one, and admitting it would seed the
// editor with a document whose shape the app no longer understands.
//
// Current canonical rows carry provenance and open without repeat validation.
// Rows created before the valid-commit boundary are unmarked, so validate them
// once before they can seed an editor session or a revert baseline.
export const admitStoredProtocol = async (
  row: StoredProtocolRow,
  dependencies: AdmissionDependencies = {},
): Promise<StoredProtocolAdmissionResult> => {
  if (row.schemaVersion > APP_SCHEMA_VERSION) {
    // Written by a newer Architect. There is no downgrade path, and guessing at
    // one would quietly discard whatever the newer schema added, so refuse with
    // the same message the import path gives a too-new file.
    return {
      success: false,
      refusal: {
        status: 'app-upgrade-required',
        protocolSchemaVersion: row.schemaVersion,
      },
    };
  }

  if (row.schemaVersion < APP_SCHEMA_VERSION) {
    // This library is this schema's alone (see `storageNames`): every row in
    // it was written by this major, after migration. Older protocols live in
    // Architect 8's library and are upgraded into a NEW row of this one, never
    // in place. A row that claims an older schema here is therefore not a
    // protocol to upgrade but one this library should never have held, and it
    // is refused like any other row that fails validation. Its provenance mark
    // proves nothing: it was a claim about a different schema.
    return {
      success: false,
      refusal: {
        status: 'validation-error',
        message: `The library row records schema version ${row.schemaVersion}, but this library holds only schema version ${APP_SCHEMA_VERSION} protocols.`,
      },
    };
  }

  if (row.validated) return { success: true, protocol: row.protocol };

  const result = await (dependencies.validate ?? validateProtocol)(
    row.protocol,
    DRAFT,
  );
  if (!result.success) {
    return {
      success: false,
      refusal: {
        status: 'validation-error',
        message: ensureError(result.error).message,
      },
    };
  }

  await (dependencies.markValidated ?? markStoredProtocolValidated)(row);
  return { success: true, protocol: row.protocol };
};
