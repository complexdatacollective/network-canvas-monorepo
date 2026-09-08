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
