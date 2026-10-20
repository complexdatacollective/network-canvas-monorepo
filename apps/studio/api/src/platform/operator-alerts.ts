import { Duration } from 'effect';

export const OPERATOR_ALERTS = {
  deliveryUncertain: 'delivery_uncertain',
  jobDeadLettered: 'job_dead_lettered',
  readinessFailing: 'readiness_failing',
  schemaMismatch: 'schema_mismatch',
  queueBacklog: 'queue_backlog',
  eventLoopLag: 'event_loop_lag',
} as const;

type OperatorAlert = (typeof OPERATOR_ALERTS)[keyof typeof OPERATOR_ALERTS];

export const alertAnnotation = (
  alert: OperatorAlert,
): { readonly alert: OperatorAlert } => ({ alert });

type SustainedRule = {
  readonly above: number;
  readonly for: Duration.Duration;
};

export const SUSTAINED_ALERT_RULES = {
  queueBacklog: { above: 100, for: Duration.minutes(10) },
  eventLoopLag: { above: 200, for: Duration.minutes(5) },
} as const satisfies Record<string, SustainedRule>;

export type Episode = {
  since: number | null;
  alerted: boolean;
};

export const quietEpisode = (): Episode => ({ since: null, alerted: false });

export const advanceEpisode = (
  episode: Episode,
  rule: SustainedRule,
  value: number,
  nowMillis: number,
): 'opened' | 'closed' | 'unchanged' => {
  if (value <= rule.above) {
    const wasAlerted = episode.alerted;
    episode.since = null;
    episode.alerted = false;
    return wasAlerted ? 'closed' : 'unchanged';
  }
  episode.since ??= nowMillis;
  if (
    !episode.alerted &&
    nowMillis - episode.since >= Duration.toMillis(rule.for)
  ) {
    episode.alerted = true;
    return 'opened';
  }
  return 'unchanged';
};
