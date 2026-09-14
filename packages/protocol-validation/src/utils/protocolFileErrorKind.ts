import {
  MigrationError,
  MigrationNotPossibleError,
  MigrationStepError,
  SchemaVersionDetectionError,
  ValidationError,
  VersionMismatchError,
} from '../migration/errors.ts';
import { NetcanvasInflationLimitError } from './extractProtocol.ts';
import { MalformedNetcanvasError } from './malformedNetcanvasError.ts';

export type ProtocolFileErrorKind =
  | 'notArchive'
  | 'missingProtocol'
  | 'damagedJson'
  | 'missingNamedAsset'
  | 'missingAsset'
  | 'invalidAsset'
  | 'inflationLimit'
  | 'newerVersion'
  | 'cannotUpgrade'
  | 'upgradeStepFailed'
  | 'missingVersion'
  | 'invalidBeforeUpgrade'
  | 'upgradeFailed';

/**
 * Kinds that can only mean the code that read the file threw, not that the
 * file was wrong.
 *
 * `MigrationChain.executeStep` catches everything a migration step throws and
 * re-raises it as `MigrationStepError`, so a null dereference inside a
 * migration arrives classified exactly like a protocol that legitimately
 * cannot be upgraded. A host deciding what to put in exception tracking must
 * tell those apart, or its own migration bugs become invisible the moment it
 * starts treating file problems as ordinary outcomes.
 */
const APP_DEFECT_KINDS = new Set<ProtocolFileErrorKind>([
  'upgradeStepFailed',
  'upgradeFailed',
]);

/**
 * Whether this failure is a fact about the file, rather than a defect in the
 * code that read it.
 *
 * The question a host asks before deciding between "tell the researcher what
 * is wrong with their file" and "report this as a bug". Distinct from
 * `getProtocolFileErrorKind`, which is a presentation taxonomy: every kind it
 * returns has a sentence for a researcher, including the two that mean we
 * broke.
 */
export function isProtocolFileFault(error: unknown): boolean {
  const kind = getProtocolFileErrorKind(error);
  return kind !== null && !APP_DEFECT_KINDS.has(kind);
}

/** One framework-free classification shared by the legacy English and localized presenters. */
export function getProtocolFileErrorKind(
  error: unknown,
): ProtocolFileErrorKind | null {
  if (error instanceof MalformedNetcanvasError) {
    switch (error.reason) {
      case 'not-an-archive':
        return 'notArchive';
      case 'missing-protocol':
        return 'missingProtocol';
      case 'unreadable-protocol-json':
      // Both say the same thing to a researcher: the bytes in the file are
      // damaged. Which entry failed to inflate is a technical detail, and
      // `damagedJson`'s sentence already speaks about the protocol's contents
      // rather than about JSON specifically.
      case 'unreadable-entry':
        return 'damagedJson';
      case 'missing-asset':
        return error.assetName ? 'missingNamedAsset' : 'missingAsset';
      case 'invalid-asset-definition':
        return 'invalidAsset';
    }
  }
  if (error instanceof NetcanvasInflationLimitError) return 'inflationLimit';
  if (error instanceof MigrationError) {
    if (error instanceof VersionMismatchError) return 'newerVersion';
    if (error instanceof MigrationNotPossibleError) return 'cannotUpgrade';
    if (error instanceof MigrationStepError) return 'upgradeStepFailed';
    if (error instanceof SchemaVersionDetectionError) return 'missingVersion';
    if (error instanceof ValidationError) return 'invalidBeforeUpgrade';
    return 'upgradeFailed';
  }
  return null;
}
