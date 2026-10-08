import { Layer, Logger, References, Tracer } from 'effect';

import { studioStructured } from '../../platform/logger.ts';

export type CapturedRecord = ReturnType<typeof studioStructured.log>;

export type Observed = {
  readonly records: CapturedRecord[];
  readonly spans: Tracer.NativeSpan[];
  readonly layer: Layer.Layer<never>;
};

export function observe(): Observed {
  const records: CapturedRecord[] = [];
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const layer = Layer.mergeAll(
    Logger.layer([
      Logger.map(studioStructured, (record) => {
        records.push(record);
      }),
    ]),
    Layer.succeed(Tracer.Tracer, tracer),
    Layer.succeed(References.MinimumLogLevel, 'All'),
  );
  return { records, spans, layer };
}

export const ancestorsOf = (span: Tracer.AnySpan): Tracer.AnySpan[] => {
  const chain: Tracer.AnySpan[] = [];
  let current = span._tag === 'Span' ? span.parent : undefined;
  while (current !== undefined && current._tag === 'Some') {
    chain.push(current.value);
    current = current.value._tag === 'Span' ? current.value.parent : undefined;
  }
  return chain;
};
