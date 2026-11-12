import { MAX_FINDINGS } from './constants.ts';
import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FIX_OPERATION_KINDS,
  type Finding,
  FindingSchema,
} from './contract.ts';

/**
 * The shape the model must answer in, as a JSON schema for structured output.
 * It is a finding without its `id`: the service numbers findings itself, so
 * they are unique whatever the model writes. Length limits are left out
 * because structured output does not support them; `normaliseFindings`
 * applies the contract's rules afterwards.
 */
const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }],
});

export const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'severity',
          'category',
          'title',
          'explanation',
          'stageId',
          'codebookEntity',
          'codebookTypeId',
          'fix',
        ],
        properties: {
          severity: { type: 'string', enum: [...FINDING_SEVERITIES] },
          category: { type: 'string', enum: [...FINDING_CATEGORIES] },
          title: { type: 'string' },
          explanation: { type: 'string' },
          stageId: nullable({ type: 'string' }),
          codebookEntity: nullable({
            type: 'string',
            enum: ['node', 'edge', 'ego'],
          }),
          codebookTypeId: nullable({ type: 'string' }),
          fix: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'changes', 'operations'],
            properties: {
              summary: { type: 'string' },
              changes: { type: 'array', items: { type: 'string' } },
              operations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['op', 'path', 'value'],
                  properties: {
                    op: { type: 'string', enum: [...FIX_OPERATION_KINDS] },
                    path: { type: 'string' },
                    value: nullable({ type: 'string' }),
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

type NormalisedFindings =
  | { ok: true; findings: Finding[] }
  | { ok: false; reason: 'unparseable' | 'no_valid_findings' };

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  serious: 0,
  worth_fixing: 1,
  suggestion: 2,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Turns the model's answer into the contract's findings: each one checked
 * against `FindingSchema` (those that fail are dropped), most serious first
 * (keeping the model's order within a severity), at most `MAX_FINDINGS`, and
 * numbered `f1`, `f2`, … in that order.
 *
 * An answer that is not the expected JSON, or whose findings all fail, is
 * not a review: an empty list would tell the researcher their protocol has
 * no problems.
 */
export const normaliseFindings = (answer: string): NormalisedFindings => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.findings)) {
    return { ok: false, reason: 'unparseable' };
  }

  const valid: Finding[] = [];
  for (const candidate of parsed.findings) {
    if (!isRecord(candidate)) continue;
    const result = FindingSchema.safeParse({ ...candidate, id: 'pending' });
    if (result.success) valid.push(result.data);
  }

  if (parsed.findings.length > 0 && valid.length === 0) {
    return { ok: false, reason: 'no_valid_findings' };
  }

  const findings = valid
    .map((finding, order) => ({ finding, order }))
    .toSorted(
      (a, b) =>
        SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
        a.order - b.order,
    )
    .slice(0, MAX_FINDINGS)
    .map(({ finding }, index) => ({ ...finding, id: `f${index + 1}` }));

  return { ok: true, findings };
};
