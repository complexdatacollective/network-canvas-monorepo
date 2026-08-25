import {
  type CurrentProtocol,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import { APP_SCHEMA_VERSION } from '~/config';

import type { StoredProtocolRow } from './assetDB';
import { describeMigrationFailure } from './describeMigrationFailure';
import {
  markStoredProtocolValidated,
  putStoredProtocol,
} from './protocolLibrary';
import { reportProtocolUpgrade } from './protocolUpgradeQueue';

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
  | { status: 'error'; title: string; message: string };

export type StoredProtocolAdmissionResult =
  | {
      success: true;
      /**
       * The document to open. Identical to `row.protocol` in the ordinary
       * case, and the upgraded document when the row was migrated — callers
       * must seed the editor from this, never from the row they read.
       */
      protocol: CurrentProtocol;
    }
  | { success: false; refusal: StoredProtocolRefusal };

type AdmissionDependencies = {
  validate?: typeof validateProtocol;
  markValidated?: typeof markStoredProtocolValidated;
  migrate?: typeof migrateProtocol;
  persist?: typeof putStoredProtocol;
  notifyUpgraded?: typeof reportProtocolUpgrade;
};

/**
 * Bring a stored row that predates this build's schema up to date, in place.
 *
 * IN PLACE, and without asking. The `.netcanvas` import path offers a migration
 * approval dialog because it is about to create a NEW library entry from
 * someone else's file, and the researcher's own copy on disk stays untouched
 * either way. A row already in this library has no such original: refusing, or
 * copying, would leave the researcher with a protocol they cannot open and a
 * decision they have no information to make. So it is migrated, saved back over
 * itself, and the researcher is told it happened.
 *
 * Nothing is written unless BOTH the migration and the re-validation succeed —
 * a failure leaves the row exactly as it was found, so the protocol can still
 * be opened by the version of Architect that wrote it.
 */
const upgradeStoredProtocol = async (
  row: StoredProtocolRow,
  dependencies: AdmissionDependencies,
): Promise<StoredProtocolAdmissionResult> => {
  let migrated: CurrentProtocol;
  try {
    migrated = (dependencies.migrate ?? migrateProtocol)(
      row.protocol,
      APP_SCHEMA_VERSION,
      { name: row.name },
    );
  } catch (caught) {
    // `migrateProtocol` throws on a document its migrations cannot carry
    // forward. `describeMigrationFailure` turns that into something the
    // researcher can act on (see its own notes on why duplicate attribute
    // names are reported rather than repaired).
    const { title, message } = describeMigrationFailure(
      ensureError(caught),
      row.protocol,
    );
    return { success: false, refusal: { status: 'error', title, message } };
  }

  const validation = await (dependencies.validate ?? validateProtocol)(
    migrated,
  );
  if (!validation.success) {
    return {
      success: false,
      refusal: {
        status: 'validation-error',
        message: ensureError(validation.error).message,
      },
    };
  }

  await (dependencies.persist ?? putStoredProtocol)({
    id: row.id,
    protocol: migrated,
    name: row.name,
    description: row.description,
    sourceRef: row.sourceRef,
    // Keep every blob the PRE-migration manifest referenced. `putStoredProtocol`
    // garbage-collects assets that the saved manifest no longer names, and a
    // migration is free to re-key the manifest — which would otherwise delete
    // the researcher's own resources during a save they never asked for. They
    // are reclaimed by the next ordinary save if they really are unreachable.
    retainedAssetIds: Object.keys(row.protocol.assetManifest ?? {}),
  });

  (dependencies.notifyUpgraded ?? reportProtocolUpgrade)({ name: row.name });

  return { success: true, protocol: migrated };
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
    return await upgradeStoredProtocol(row, dependencies);
  }

  if (row.validated) return { success: true, protocol: row.protocol };

  const result = await (dependencies.validate ?? validateProtocol)(
    row.protocol,
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
