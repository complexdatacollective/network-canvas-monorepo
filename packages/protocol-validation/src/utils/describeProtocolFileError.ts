import { NetcanvasInflationLimitError } from './extractProtocol.ts';
import { MalformedNetcanvasError } from './malformedNetcanvasError.ts';
import { getProtocolFileErrorKind } from './protocolFileErrorKind.ts';

/**
 * Researcher-safe copy for an error THIS PACKAGE throws while opening a
 * protocol file, or `null` when the error is not one of ours.
 *
 * Every failure below happens to a file a researcher chose, in an app they are
 * using to get work done, so each sentence says what is wrong with the file and
 * — where there is one — what to try instead. None of them repeat the archive
 * library's wording, a JSON parser's cursor position, or a schema version
 * arithmetic message: those stay on the error's own `message`, for the console,
 * for exception reporting, and for a host that offers technical details behind
 * a disclosure.
 *
 * Returning `null` rather than a generic sentence is deliberate. The host knows
 * about failures this package cannot see (storage quota, a dead network) and
 * must be free to describe those itself instead of inheriting a default that
 * blames the file.
 */
export const describeProtocolFileError = (error: unknown): string | null => {
  switch (getProtocolFileErrorKind(error)) {
    case 'notArchive':
      return "This file isn't a Network Canvas protocol. Check that you chose the right file, and that it finished downloading.";
    case 'missingProtocol':
      return 'This file is missing its protocol, so there is nothing to open. It may have been created by another program, or damaged in transit.';
    case 'damagedJson':
      return "This protocol's contents are damaged and cannot be read. Try a backup, or the copy you originally downloaded.";
    case 'missingNamedAsset':
      return error instanceof MalformedNetcanvasError
        ? `This protocol refers to a file that isn't included in it: "${error.assetName}".`
        : null;
    case 'missingAsset':
      return "This protocol refers to a file that isn't included in it.";
    case 'invalidAsset':
      return "One of this protocol's resources is described in a way this version does not understand, so the protocol cannot be opened.";
    case 'inflationLimit':
      return error instanceof NetcanvasInflationLimitError
        ? error.message
        : null;
    case 'newerVersion':
      return 'This protocol was made with a newer version of Network Canvas. Update to the latest version to open it.';
    case 'cannotUpgrade':
      return 'This protocol was made with a version of Network Canvas it cannot be upgraded from. Open it in the version that made it and save it there first.';
    case 'upgradeStepFailed':
      return 'This protocol could not be upgraded to the current version. Nothing has been changed on this device.';
    case 'missingVersion':
      return 'This file does not say which version of Network Canvas made it, so it cannot be opened.';
    case 'invalidBeforeUpgrade':
      return 'This protocol did not pass the checks for the version it was made with, so it could not be upgraded.';
    case 'upgradeFailed':
      return 'This protocol could not be upgraded to the current version.';
    case null:
      return null;
  }
};
