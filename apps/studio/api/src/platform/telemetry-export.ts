import {
  Cause,
  Context,
  Effect,
  type Fiber,
  Layer,
  Logger,
  Option,
  References,
} from 'effect';
import { HttpBody } from 'effect/http';
import {
  type OtlpLogger,
  type OtlpMetrics,
  type OtlpResource,
  OtlpSerialization,
  type OtlpTracer,
} from 'effect/observability';

import { InstallationIdentity } from './installation-identity.ts';
import { correlationOf } from './logger.ts';

const INSTALLATION_ATTRIBUTE = 'studio.installation_id';

type KeyValue = OtlpResource.KeyValue;
type Resource = OtlpResource.Resource;
type ResourceSpan = OtlpTracer.TraceData['resourceSpans'][number];
type OtlpSpan = ResourceSpan['scopeSpans'][number]['spans'][number];
type ResourceLogs = OtlpLogger.LogsData['resourceLogs'][number];
type ResourceMetrics = OtlpMetrics.MetricsData['resourceMetrics'][number];

const STACK_FRAME = /^\s+at /;

const INFRASTRUCTURE_ATTRIBUTES = new Set(['server.address', 'db.namespace']);

const stackFrames = (stack: string | null | undefined): string =>
  (stack ?? '')
    .split('\n')
    .filter((line) => STACK_FRAME.test(line))
    .join('\n');

const framesAfter = (
  stack: string | null | undefined,
  message: string | undefined,
): string => {
  const text = stack ?? '';
  const at =
    message === undefined || message === '' ? -1 : text.indexOf(message);
  return stackFrames(
    at === -1 ? text : text.slice(at + (message ?? '').length),
  );
};

const ERROR_TYPE = /^[A-Za-z][\w.]{0,99}$/;

export const safeExceptionType = (name: string | null | undefined): string =>
  typeof name === 'string' && ERROR_TYPE.test(name) ? name : 'Error';

export const failureFrames = (error: Error): string =>
  framesAfter(error.stack, error.message);

const withInstallation = (
  resource: Resource | undefined,
  installationId: Option.Option<string>,
): Resource => {
  const base = resource ?? { attributes: [], droppedAttributesCount: 0 };
  return Option.match(installationId, {
    onNone: () => base,
    onSome: (value) => ({
      ...base,
      attributes: [
        ...base.attributes.filter(
          (attribute) => attribute.key !== INSTALLATION_ATTRIBUTE,
        ),
        { key: INSTALLATION_ATTRIBUTE, value: { stringValue: value } },
      ],
    }),
  });
};

const exceptionAttributes = (
  attributes: ReadonlyArray<KeyValue>,
): KeyValue[] => {
  const valueOf = (key: string) =>
    attributes.find((attribute) => attribute.key === key)?.value.stringValue ??
    undefined;
  const message = valueOf('exception.message');
  return attributes.flatMap((attribute) => {
    if (
      attribute.key === 'exception.message' ||
      attribute.key === 'effect.cause'
    ) {
      return [];
    }
    if (attribute.key === 'exception.stacktrace') {
      return [
        {
          key: attribute.key,
          value: {
            stringValue: framesAfter(attribute.value.stringValue, message),
          },
        },
      ];
    }
    if (attribute.key === 'exception.type') {
      return [
        {
          key: attribute.key,
          value: {
            stringValue: safeExceptionType(attribute.value.stringValue),
          },
        },
      ];
    }
    return [attribute];
  });
};

const scrubSpan = (span: OtlpSpan): OtlpSpan => ({
  ...span,
  attributes: exceptionAttributes(
    span.attributes.filter(
      (attribute) => !INFRASTRUCTURE_ATTRIBUTES.has(attribute.key),
    ),
  ),
  status: { code: span.status.code },
  events: span.events.map((event) => ({
    ...event,
    attributes: exceptionAttributes(
      event.attributes.filter((attribute) => attribute.key !== 'effect.cause'),
    ),
  })),
});

const scrubTraces = (
  data: OtlpTracer.TraceData,
  installationId: Option.Option<string>,
): OtlpTracer.TraceData => ({
  resourceSpans: data.resourceSpans.map((resourceSpan) => ({
    ...resourceSpan,
    resource: withInstallation(resourceSpan.resource, installationId),
    scopeSpans: resourceSpan.scopeSpans.map((scopeSpan) => ({
      ...scopeSpan,
      spans: scopeSpan.spans.map(scrubSpan),
    })),
  })),
});

const scrubLogs = (
  data: OtlpLogger.LogsData,
  installationId: Option.Option<string>,
): OtlpLogger.LogsData => ({
  resourceLogs: data.resourceLogs.map((resourceLogs): ResourceLogs => ({
    ...resourceLogs,
    resource: withInstallation(resourceLogs.resource, installationId),
    scopeLogs: resourceLogs.scopeLogs.map((scopeLogs) => ({
      ...scopeLogs,
      logRecords: scopeLogs.logRecords?.map((record) => ({
        ...record,
        attributes: exceptionAttributes(
          record.attributes.filter(
            (attribute) => attribute.key !== 'log.error',
          ),
        ),
      })),
    })),
  })),
});

const scrubMetrics = (
  data: OtlpMetrics.MetricsData,
  installationId: Option.Option<string>,
): OtlpMetrics.MetricsData => ({
  resourceMetrics: data.resourceMetrics.map(
    (resourceMetrics): ResourceMetrics => ({
      ...resourceMetrics,
      resource: withInstallation(resourceMetrics.resource, installationId),
    }),
  ),
});

export const StudioSerialization: Layer.Layer<
  OtlpSerialization.OtlpSerialization,
  never,
  InstallationIdentity
> = Layer.effect(
  OtlpSerialization.OtlpSerialization,
  Effect.map(InstallationIdentity, (identity) => ({
    traces: (data) =>
      HttpBody.jsonUnsafe(scrubTraces(data, identity.current())),
    logs: (data) => HttpBody.jsonUnsafe(scrubLogs(data, identity.current())),
    metrics: (data) =>
      HttpBody.jsonUnsafe(scrubMetrics(data, identity.current())),
  })),
);

const failureAttributes = (
  cause: Cause.Cause<unknown>,
): Record<string, string> => {
  if (cause.reasons.length === 0 || Cause.hasInterruptsOnly(cause)) return {};
  const [first] = Cause.prettyErrors(cause);
  if (first === undefined) return {};
  return {
    'exception.type': safeExceptionType(first.name),
    'exception.stacktrace': failureFrames(first),
  };
};

const annotatedFiber = (
  fiber: Fiber.Fiber<unknown, unknown>,
  extra: Record<string, string>,
): Fiber.Fiber<unknown, unknown> => {
  const context = Context.add(fiber.context, References.CurrentLogAnnotations, {
    ...fiber.getRef(References.CurrentLogAnnotations),
    ...extra,
  });
  const getRef: Fiber.Fiber<unknown, unknown>['getRef'] = (reference) =>
    Context.get(context, reference);
  return new Proxy(fiber, {
    get(target, property) {
      if (property === 'getRef') return getRef;
      if (property === 'context') return context;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

export const exportedLogger = (
  base: Logger.Logger<unknown, void>,
): Logger.Logger<unknown, void> =>
  Logger.make((options) =>
    base.log({
      ...options,
      cause: Cause.empty,
      fiber: annotatedFiber(options.fiber, {
        ...correlationOf(options.fiber.context),
        ...failureAttributes(options.cause),
      }),
    }),
  );
