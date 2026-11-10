import { ensureError } from '@codaco/shared-consts';

import { labelCollisionIssues } from '../localization/labelCollisions.ts';
import { findBuiltInWordingProblems } from '../schemas/9/built-in-wording.ts';
import { findFinishStageTextProblems } from '../schemas/9/finish-stage-text.ts';
import {
  type VersionedProtocol,
  VersionedProtocolSchema,
} from '../schemas/index.ts';
import { findPrototypeCodebookKeys } from './prototypeCodebookKeys.ts';

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

/** The issue code for a finish stage missing text a participant must read. */
export const FINISH_STAGE_TEXT_MISSING = 'finish_stage_text_missing';

const FINISH_STAGE_TEXT_LABELS = {
  content: 'closing text',
  finishedContent: 'finished text',
} as const;

/**
 * The finish stage text missing in the protocol's default language, as
 * validation issues: something only a protocol being written may lack.
 */
const finishStageTextIssues = (
  protocol: VersionedProtocol,
): ProtocolValidationIssue[] =>
  protocol.schemaVersion !== 9
    ? []
    : findFinishStageTextProblems(protocol).flatMap((problem) =>
        problem.missing.map((field) => ({
          code: FINISH_STAGE_TEXT_MISSING,
          path: ['stages', problem.stageIndex, field, problem.locale],
          message: `The stage that ends the interview has no ${FINISH_STAGE_TEXT_LABELS[field]} in the protocol's default language (${problem.locale}).`,
        })),
      );

/**
 * The issue code for wording Network Canvas supplies that has no text in the
 * protocol's default language.
 */
export const BUILT_IN_WORDING_MISSING = 'built_in_wording_missing';

/**
 * Wording Network Canvas supplies with no text in the protocol's default
 * language, as validation issues: something only a protocol being written
 * may lack (see `findBuiltInWordingProblems`).
 */
const builtInWordingIssues = (
  protocol: VersionedProtocol,
): ProtocolValidationIssue[] =>
  protocol.schemaVersion !== 9
    ? []
    : findBuiltInWordingProblems(protocol).map((problem) => ({
        code: BUILT_IN_WORDING_MISSING,
        path: [...problem.path, problem.locale],
        message: `Network Canvas has no built-in wording in the protocol's default language (${problem.locale}), so this text must be written in it, or a language Network Canvas has wording in made the default.`,
      }));

/**
 * What a protocol being written may hold but a protocol handed over may not:
 * text in its default language that Network Canvas has no wording in it for
 * (the finish stage's closing and finished text, and its other built-in
 * wording), and two labels a participant chooses between that read the same
 * (`labelCollisionIssues`), which a change of the protocol's languages can
 * leave through fallback.
 */
export const releaseIssues = (
  protocol: VersionedProtocol,
): ProtocolValidationIssue[] =>
  protocol.schemaVersion !== 9
    ? []
    : [
        ...finishStageTextIssues(protocol),
        ...builtInWordingIssues(protocol),
        ...labelCollisionIssues(protocol),
      ];

export type ValidateProtocolOptions = {
  /**
   * The protocol is still being written, in an editor: allow what a protocol
   * may hold until it leaves the editor (`releaseIssues`). Everything that
   * reads a protocol someone has handed over — an import, a publish, a
   * download — leaves this off.
   */
  draft?: boolean;
};

/**
 * Enhanced validateProtocol that uses Zod 4 with integrated cross-reference validation.
 * All validation logic (schema + cross-references) is now handled natively by Zod.
 * Returns a domain-owned result: the parsed protocol on success, or a
 * ProtocolValidationError carrying the validation issues on failure.
 *
 * Pass the document as it was read, not the output of a schema parse: a parse
 * has already dropped any `__proto__` codebook id, which this refuses.
 */
const validateProtocol = async (
  protocol: unknown,
  { draft = false }: ValidateProtocolOptions = {},
): Promise<ProtocolValidationResult> => {
  if (protocol === undefined) {
    throw new Error('Protocol is undefined');
  }

  try {
    const prototypeKeyIssues = findPrototypeCodebookKeys(protocol);
    const result = await VersionedProtocolSchema.safeParseAsync(protocol);

    const handedOverIssues =
      result.success && !draft ? releaseIssues(result.data) : [];

    if (
      result.success &&
      prototypeKeyIssues.length === 0 &&
      handedOverIssues.length === 0
    ) {
      return { success: true, data: result.data };
    }

    const schemaIssues = result.success
      ? handedOverIssues
      : result.error.issues.map((issue) => ({
          code: issue.code,
          // Zod paths are PropertyKey[]; symbols cannot appear in protocol JSON but
          // are stringified so the domain path stays (string | number)[].
          path: issue.path.map((segment) =>
            typeof segment === 'symbol' ? String(segment) : segment,
          ),
          message: issue.message,
        }));

    return {
      success: false,
      error: new ProtocolValidationError([
        ...prototypeKeyIssues,
        ...schemaIssues,
      ]),
    };
  } catch (e) {
    const error = ensureError(e);

    throw new Error(
      `Protocol validation failed due to an internal error: ${error.message}`,
      { cause: e },
    );
  }
};

export default validateProtocol;
