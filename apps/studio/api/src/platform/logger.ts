import {
  Context,
  Effect,
  Formatter,
  Layer,
  Logger,
  MutableRef,
  Option,
  References,
  Tracer,
} from 'effect';

import { Environment } from '../env.ts';
import { RequestId } from '../http/middleware/request-id.ts';
import { RequestTeam } from './request-team.ts';

const correlationOf = (
  context: Context.Context<never>,
): Record<string, string> => {
  const keys: Record<string, string> = {};
  const requestId = Context.getOption(context, RequestId);
  if (Option.isSome(requestId)) keys.request_id = requestId.value;
  const team = Context.getOption(context, RequestTeam);
  if (Option.isSome(team)) {
    const teamId = MutableRef.get(team.value);
    if (Option.isSome(teamId)) keys.team_id = teamId.value;
  }
  const span = Context.getOption(context, Tracer.ParentSpan);
  if (Option.isSome(span)) {
    keys.trace_id = span.value.traceId;
    keys.span_id = span.value.spanId;
  }
  return keys;
};

export const studioStructured = Logger.make((options) => {
  const record = Logger.formatStructured.log(options);
  return {
    ...record,
    annotations: {
      ...record.annotations,
      ...correlationOf(options.fiber.context),
    },
  };
});

const studioJson = Logger.withConsoleLog(
  Logger.map(studioStructured, (record) => Formatter.formatJson(record)),
);

export const LoggerLive: Layer.Layer<never> = Logger.layer([studioJson]);

export const LogLevelLive: Layer.Layer<never, never, Environment> =
  Layer.unwrap(
    Effect.map(Environment, (env) =>
      Layer.succeed(References.MinimumLogLevel, env.logLevel),
    ),
  );
