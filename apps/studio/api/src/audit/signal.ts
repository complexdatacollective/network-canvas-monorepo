import { Context, Effect, Layer, Ref } from 'effect';

export type AuditSignalCode =
  | 'STUDIO_AUDIT_APPEND_FAILED'
  | 'STUDIO_AUDIT_DENIAL_EVENT_LOST'
  | 'STUDIO_DENIED_AUDIT_SUMMARY_FAILED';

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
