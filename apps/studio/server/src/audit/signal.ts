import { Context, Effect, Layer, Ref } from 'effect';

// The operator channel (#1927 §10). Three sites used to call
// `process.emitWarning` directly — the required-append failure in
// `audit/command.ts`, the lost denial event in `rpc.ts`, and the summary job's
// write failure. They are one service now, with one live implementation that
// emits **both** the `process.emitWarning` the operator documentation names
// and an `Effect.logError` carrying `code` as an annotation, so #1897's OTLP
// relay sees it too.
//
// The point of the service is the tests: they stop spying on `process`, which
// is a global and therefore order-dependent, and read a recorded list instead.

export type AuditSignalCode =
  | 'STUDIO_AUDIT_APPEND_FAILED'
  | 'STUDIO_AUDIT_DENIAL_EVENT_LOST'
  | 'STUDIO_DENIED_AUDIT_SUMMARY_FAILED';

/** What each code means to an operator, and what the warning says. */
const MESSAGES: Record<AuditSignalCode, string> = {
  STUDIO_AUDIT_APPEND_FAILED:
    'Required immutable audit event append failed; transaction will roll back.',
  STUDIO_AUDIT_DENIAL_EVENT_LOST:
    'An audit read denial could not be recorded; the read was still denied.',
  STUDIO_DENIED_AUDIT_SUMMARY_FAILED:
    'A denied-attempts summary could not be written for one window.',
};

export class AuditSignal extends Context.Service<
  AuditSignal,
  {
    readonly warn: (
      code: AuditSignalCode,
      detail: Record<string, unknown>,
    ) => Effect.Effect<void>;
  }
>()('@studio/audit/AuditSignal') {
  static readonly layer: Layer.Layer<AuditSignal> = Layer.succeed(
    AuditSignal,
    AuditSignal.of({
      warn: (code, detail) =>
        Effect.gen(function* () {
          const serialised = JSON.stringify(detail);
          yield* Effect.sync(() => {
            process.emitWarning(MESSAGES[code], {
              type: 'StudioAuditError',
              code,
              detail: serialised,
            });
          });
          yield* Effect.logError(MESSAGES[code]).pipe(
            Effect.annotateLogs({ code, ...detail }),
          );
        }),
    }),
  );

  /**
   * Records instead of warning, and exposes the record. A suite asserting that
   * an operator was told something reads this rather than installing a spy on
   * a process-wide global.
   */
  static readonly layerRecording: Layer.Layer<AuditSignal | RecordedSignals> =
    Layer.effectContext(
      Effect.map(Ref.make<readonly RecordedSignal[]>([]), (ref) =>
        Context.make(
          AuditSignal,
          AuditSignal.of({
            warn: (code, detail) =>
              Ref.update(ref, (signals) => [...signals, { code, detail }]),
          }),
        ).pipe(
          Context.add(
            RecordedSignals,
            RecordedSignals.of({
              signals: Ref.get(ref),
              clear: Ref.set(ref, []),
            }),
          ),
        ),
      ),
    );
}

export type RecordedSignal = {
  readonly code: AuditSignalCode;
  readonly detail: Record<string, unknown>;
};

export class RecordedSignals extends Context.Service<
  RecordedSignals,
  {
    readonly signals: Effect.Effect<readonly RecordedSignal[]>;
    readonly clear: Effect.Effect<void>;
  }
>()('@studio/audit/RecordedSignals') {}
