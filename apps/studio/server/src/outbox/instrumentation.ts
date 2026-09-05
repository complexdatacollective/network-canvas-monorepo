/** Finite queue names keep payloads and identifiers out of metric labels. */
export type OutboxQueue =
  | 'team_invitation_deliveries'
  | 'audit_alert_outbox'
  | 'audit_export_jobs'
  | 'message_deliveries'
  | 'webhook_deliveries'
  | 'study_wave_rollups'
  | 'study_stage_rollups';

export type OutboxDispatchResult = {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  suppressed: number;
  uncertain: number;
  leaseLost: number;
};

/** Only classifications and measurements cross the observability boundary. */
export type OutboxLifecycleEvent = Readonly<
  { queue: OutboxQueue } & (
    | ({ kind: 'dispatch'; durationMs: number } & OutboxDispatchResult)
    | { kind: 'dispatch_error' | 'worker_error' }
    | { kind: 'heartbeat'; outcome: 'renewed' | 'lost' | 'error' }
  )
>;

export type OutboxObserver = (
  event: OutboxLifecycleEvent,
) => void | Promise<void>;

/** Observability failures must not change whether a delivery is attempted. */
export function observeOutbox(
  observer: OutboxObserver | undefined,
  event: OutboxLifecycleEvent,
): void {
  try {
    void Promise.resolve(observer?.(Object.freeze(event))).catch(
      () => undefined,
    );
  } catch {
    // A synchronous observer has the same isolation as an asynchronous one.
  }
}
