// One call for the deterministic half of the pipeline:
//   analyse(design) -> compile(normalised design, wording) -> validateProtocol.
//
// The pipeline runs it twice per attempt (SPEC §0):
//   - preflight(design): no wording, straight after step 2, to decide the retry
//     before the wording call is paid for;
//   - buildProtocol(design, wording): steps 4 and 5.
// Wording only overlays non-empty strings, so a design whose preflight
// validates also validates with wording; if it ever does not, ship the
// preflight protocol.
import {
  findVariableRoleConflicts,
  type ProtocolValidationIssue,
  type ProtocolValidationResult,
  type VersionedProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import type { GeneratedAsset, ProtocolSummary } from '../../shared/api.ts';
import { analyse, needsRetry, type NormalizedDesign } from './analyse.ts';
import {
  compile,
  type CompileOptions,
  type SketchProtocol,
  type StageSource,
} from './compile.ts';
import { formatRetryFeedback } from './feedback.ts';
import type { DesignIssue } from './rules.ts';
import type { StudyDesign, Wording } from './schema.ts';

export type BuildResult = {
  protocol: SketchProtocol;
  assets: GeneratedAsset[];
  summary: ProtocolSummary;
  /** Every issue analyse() found, of every severity, after any extraIssues. */
  issues: DesignIssue[];
  validation: ProtocolValidationResult;
  stageMap: StageSource[];
  sourceMap: Map<string, string>;
  /** The repaired design: the input to buildWordingRequest(). */
  design: NormalizedDesign;
  /** Set when the design has no stage that collects data; the protocol is still compiled. */
  fatal: string | null;
  /** True when attempt 1 should retry step 2: fatal, a degraded issue, or a validation failure. */
  retry: boolean;
};

export type BuildOptions = Omit<CompileOptions, 'issues'> & {
  /** Issues found outside analyse(), such as stages the pipeline removed. */
  extraIssues?: DesignIssue[];
};

/** `design` must already have passed StudyDesignSchema.safeParse. */
export const buildProtocol = async (
  design: StudyDesign,
  wording: Wording | null,
  options: BuildOptions = {},
): Promise<BuildResult> => {
  const { extraIssues = [], ...compileOptions } = options;
  const analysed = analyse(design);
  const { design: normalized, fatal } = analysed;
  const issues = [...extraIssues, ...analysed.issues];
  const compiled = compile(normalized, wording ?? undefined, {
    ...compileOptions,
    issues,
  });
  // compile() emits the schema's input shape; validateProtocol parses it.
  const validation = await validateProtocol(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the parse is the check
    compiled.protocol as VersionedProtocol,
  );
  // analyse() keeps form attributes out of unvalidated writers; anything it
  // misses is a design fault the model is asked to fix.
  for (const c of findVariableRoleConflicts(compiled.protocol)) {
    issues.push({
      severity: 'degraded',
      code: 'WRITTEN_WITHOUT_VALIDATION',
      path: 'stages',
      message: `"${c.variableName}" is asked in a form and also written by a stage that skips the form's validation. Collect it in one place only.`,
    });
  }
  return {
    ...compiled,
    issues,
    validation,
    design: normalized,
    fatal,
    retry: fatal !== null || needsRetry(issues) || !validation.success,
  };
};

/** analyse -> compile without wording -> validate: the retry decision after step 2. */
export const preflight = (
  design: StudyDesign,
  options: BuildOptions = {},
): Promise<BuildResult> => buildProtocol(design, null, options);

export const validationIssues = (
  result: Pick<BuildResult, 'validation'>,
): ProtocolValidationIssue[] =>
  result.validation.success ? [] : result.validation.error.issues;

/** The step-2 retry message for a failed preflight. */
export const retryFeedback = (
  result: Pick<
    BuildResult,
    'issues' | 'validation' | 'stageMap' | 'sourceMap' | 'fatal'
  >,
): string => {
  const message = formatRetryFeedback(
    result.issues,
    validationIssues(result),
    result.stageMap,
    result.sourceMap,
  );
  return result.fatal
    ? `${message}\n\nThe design as a whole: ${result.fatal}`
    : message;
};
