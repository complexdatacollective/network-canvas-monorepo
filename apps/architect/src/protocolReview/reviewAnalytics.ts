import {
  FINDING_SEVERITIES,
  type Finding,
  type FindingCategory,
  type FindingSeverity,
  type ReviewErrorCode,
} from '@codaco/protocol-review-worker/contract';
import { posthog } from '~/analytics';

import type { FindingDecision } from './reviewStore';

/**
 * The protocol review's analytics events. Each payload is built here from
 * fixed codes, numbers and booleans only: nothing from the protocol, the
 * findings' text or the study details, and no ids, may be sent. The types
 * below are what make that so; keep every property one of them.
 */

type CompletedPayload = {
  finding_count: number;
  serious_count: number;
  worth_fixing_count: number;
  suggestion_count: number;
  duration_ms: number;
};

export const completedPayload = (
  findings: readonly Pick<Finding, 'severity'>[],
  durationMs: number,
): CompletedPayload => {
  const count = (severity: FindingSeverity) =>
    findings.filter((finding) => finding.severity === severity).length;
  const [serious, worthFixing, suggestion] = FINDING_SEVERITIES.map(count);
  return {
    finding_count: findings.length,
    serious_count: serious ?? 0,
    worth_fixing_count: worthFixing ?? 0,
    suggestion_count: suggestion ?? 0,
    duration_ms: Math.max(0, Math.round(durationMs)),
  };
};

type DecisionPayload = {
  decision: FindingDecision;
  severity: FindingSeverity;
  category: FindingCategory;
};

export const decisionPayload = (
  decision: FindingDecision,
  finding: Pick<Finding, 'severity' | 'category'>,
): DecisionPayload => ({
  decision,
  severity: finding.severity,
  category: finding.category,
});

type StartedPayload = { share: boolean };

export const captureReviewStarted = (payload: StartedPayload) => {
  posthog.capture('protocol_review_started', payload);
};

export const captureReviewCompleted = (payload: CompletedPayload) => {
  posthog.capture('protocol_review_completed', payload);
};

export const captureReviewFailed = (code: ReviewErrorCode) => {
  posthog.capture('protocol_review_failed', { error_code: code });
};

export const captureReviewDecision = (payload: DecisionPayload) => {
  posthog.capture('protocol_review_decision', payload);
};
