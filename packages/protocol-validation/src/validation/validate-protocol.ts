import {
  type VersionedProtocol,
  VersionedProtocolSchema,
} from '../schemas/index.ts';
import { ensureError } from '../utils/ensureError.ts';

export type ProtocolValidationIssue = {
  /** Machine-readable issue code (currently Zod's issue codes, e.g. 'invalid_type', 'custom'). */
  code: string;
  /** Segments from the protocol root to the failing value. */
  path: (string | number)[];
  /** Human-readable description of the failure. */
  message: string;
};

/** Single-string rendering of validation issues for dialogs, CLI output, and logs. */
export const formatProtocolValidationIssues = (
  issues: readonly ProtocolValidationIssue[],
): string =>
  issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('\n');

export class ProtocolValidationError extends Error {
  readonly issues: ProtocolValidationIssue[];

  constructor(issues: ProtocolValidationIssue[]) {
    super(formatProtocolValidationIssues(issues));
    this.name = 'ProtocolValidationError';
    this.issues = issues;
  }
}

// The `never` members mirror Zod's safe-parse envelope so a caller can read
// `result.error?.issues` without first narrowing on `success`.
export type ProtocolValidationResult =
  | { success: true; data: VersionedProtocol; error?: never }
  | { success: false; data?: never; error: ProtocolValidationError };

/**
 * Enhanced validateProtocol that uses Zod 4 with integrated cross-reference validation.
 * All validation logic (schema + cross-references) is now handled natively by Zod.
 * Returns a domain-owned result: the parsed protocol on success, or a
 * ProtocolValidationError carrying the validation issues on failure.
 */
const validateProtocol = async (
  protocol: VersionedProtocol,
): Promise<ProtocolValidationResult> => {
  if (protocol === undefined) {
    throw new Error('Protocol is undefined');
  }

  try {
    const result = await VersionedProtocolSchema.safeParseAsync(protocol);

    if (result.success) {
      return { success: true, data: result.data };
    }

    const issues = result.error.issues.map((issue) => ({
      code: issue.code,
      // Zod paths are PropertyKey[]; symbols cannot appear in protocol JSON but
      // are stringified so the domain path stays (string | number)[].
      path: issue.path.map((segment) =>
        typeof segment === 'symbol' ? String(segment) : segment,
      ),
      message: issue.message,
    }));

    return { success: false, error: new ProtocolValidationError(issues) };
  } catch (e) {
    const error = ensureError(e);

    throw new Error(
      `Protocol validation failed due to an internal error: ${error.message}`,
      { cause: e },
    );
  }
};

export default validateProtocol;
