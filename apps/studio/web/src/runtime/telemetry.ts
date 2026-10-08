import { Effect, Layer, Predicate } from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as RpcClient from 'effect/rpc/RpcClient';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import { useEffect } from 'react';

import { RPC_PATH } from '@codaco/studio-contract/rpc/studio';
import { TelemetryRpcs } from '@codaco/studio-contract/rpc/telemetry';
import {
  ANONYMOUS_FUNCTION,
  type ErrorReport,
  MAX_REPORTED_FRAMES,
  REPORTED_BUNDLE_PATH,
  REPORTED_CHUNK_ID,
  REPORTED_ERROR_TYPE,
  REPORTED_FUNCTION_NAME,
  type ReportedFrame,
} from '@codaco/studio-contract/schema/telemetry';

export type ReportingSurface = ErrorReport['surface'];

export type SendReport = (report: ErrorReport) => Promise<void>;

const MAX_REPORTS_PER_PAGE = 10;

const CHROME_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;

const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

type ParsedFrame = {
  readonly location: string;
  readonly function: string | undefined;
  readonly lineno: number;
  readonly colno: number;
};

const parseLine = (line: string): ParsedFrame | undefined => {
  const parts = CHROME_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
  if (parts === null) return undefined;
  const [, name, location = '', lineno = '', colno = ''] = parts;
  return {
    location,
    function: name === '' ? undefined : name,
    lineno: Number(lineno),
    colno: Number(colno),
  };
};

const parseStack = (stack: string): ParsedFrame[] =>
  stack.split('\n').flatMap((line) => {
    const frame = parseLine(line);
    return frame === undefined ? [] : [frame];
  });

const stackAfterMessage = (error: Error): string => {
  const stack = error.stack ?? '';
  const at = error.message === '' ? -1 : stack.indexOf(error.message);
  return at === -1 ? stack : stack.slice(at + error.message.length);
};

const registeredChunkIds = (): ReadonlyMap<string, string> => {
  const registered: unknown = Reflect.get(globalThis, '_posthogChunkIds');
  const chunks = new Map<string, string>();
  if (!Predicate.isObject(registered)) return chunks;
  for (const [stack, chunkId] of Object.entries(registered)) {
    const location = parseStack(stack).at(-1)?.location;
    if (location !== undefined && Predicate.isString(chunkId)) {
      chunks.set(location, chunkId);
    }
  }
  return chunks;
};

const bundleFrame = (
  frame: ParsedFrame,
  origin: string,
  chunks: ReadonlyMap<string, string>,
): ReportedFrame[] => {
  if (!URL.canParse(frame.location)) return [];
  const url = new URL(frame.location);
  if (url.origin !== origin || !REPORTED_BUNDLE_PATH.test(url.pathname)) {
    return [];
  }
  const chunkId = chunks.get(frame.location);
  return [
    {
      filename: url.pathname,
      function:
        frame.function !== undefined &&
        REPORTED_FUNCTION_NAME.test(frame.function)
          ? frame.function
          : ANONYMOUS_FUNCTION,
      lineno: frame.lineno,
      colno: frame.colno,
      ...(chunkId !== undefined && REPORTED_CHUNK_ID.test(chunkId)
        ? { chunkId }
        : {}),
    },
  ];
};

const errorReport = (
  error: unknown,
  surface: ReportingSurface,
  origin: string,
): ErrorReport => {
  if (!(error instanceof Error)) return { surface, type: 'Error', frames: [] };
  const chunks = registeredChunkIds();
  return {
    surface,
    type: REPORTED_ERROR_TYPE.test(error.name) ? error.name : 'Error',
    frames: parseStack(stackAfterMessage(error))
      .flatMap((frame) => bundleFrame(frame, origin, chunks))
      .slice(0, MAX_REPORTED_FRAMES),
  };
};

const ReportProtocol = RpcClient.layerProtocolHttp({ url: RPC_PATH }).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(
    FetchHttpClient.layer.pipe(
      Layer.provide(
        Layer.succeed(FetchHttpClient.RequestInit)({ credentials: 'omit' }),
      ),
    ),
  ),
);

const sendReport: SendReport = (report) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(
        RpcClient.make(TelemetryRpcs, { flatten: true }),
        (client) => client('telemetry.report', report),
      ),
    ).pipe(Effect.provide(ReportProtocol), Effect.ignore),
  );

export type TelemetryTarget = Pick<
  Window,
  'addEventListener' | 'removeEventListener'
> & { readonly location: Pick<Location, 'origin'> };

const budgets = new WeakMap<TelemetryTarget, { remaining: number }>();

const budgetOf = (target: TelemetryTarget): { remaining: number } => {
  const known = budgets.get(target);
  if (known !== undefined) return known;
  const fresh = { remaining: MAX_REPORTS_PER_PAGE };
  budgets.set(target, fresh);
  return fresh;
};

export function startErrorTelemetry(
  surface: ReportingSurface,
  send: SendReport = sendReport,
  target: TelemetryTarget = window,
): () => void {
  const budget = budgetOf(target);
  const report = (error: unknown) => {
    if (budget.remaining <= 0) return;
    budget.remaining -= 1;
    send(errorReport(error, surface, target.location.origin)).catch(
      () => undefined,
    );
  };
  const onError = (event: ErrorEvent) => {
    if (event.error !== null && event.error !== undefined) report(event.error);
  };
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

export function useErrorTelemetry(
  surface: ReportingSurface,
  enabled: boolean,
  send: SendReport = sendReport,
): void {
  useEffect(
    () => (enabled ? startErrorTelemetry(surface, send) : undefined),
    [surface, enabled, send],
  );
}
