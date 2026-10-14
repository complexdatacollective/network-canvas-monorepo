export const OPERATOR_ALERTS = {
  deliveryUncertain: 'delivery_uncertain',
  jobDeadLettered: 'job_dead_lettered',
  readinessFailing: 'readiness_failing',
  schemaMismatch: 'schema_mismatch',
} as const;

type OperatorAlert = (typeof OPERATOR_ALERTS)[keyof typeof OPERATOR_ALERTS];

export const alertAnnotation = (
  alert: OperatorAlert,
): { readonly alert: OperatorAlert } => ({ alert });
