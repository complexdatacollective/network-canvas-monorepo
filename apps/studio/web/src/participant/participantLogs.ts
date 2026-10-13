import { Effect, Option, Predicate, Schema } from 'effect';
import * as RpcClient from 'effect/rpc/RpcClient';
import { type ComponentProps, useEffect } from 'react';

import type { Shell } from '@codaco/interview';
import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';
import { StatusRpcs } from '@codaco/studio-contract/rpc/status';
import type {
  FaultCode,
  LogLevelName,
} from '@codaco/studio-contract/schema/browser-logs';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';
import { UsageInterfaceType } from '@codaco/studio-sync/jobs';

import { logParticipant, startBrowserLogs } from '../runtime/browserLogs.ts';
import { CredentiallessProtocol } from '../runtime/telemetry.ts';

type AnalyticsClient = NonNullable<
  ComponentProps<typeof Shell>['posthogClient']
>;

export type ParticipantStage = {
  readonly stage_index: number;
  readonly interface_type: typeof UsageInterfaceType.Type;
};

const MAX_STAGE_INDEX = 10_000;

const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_ATTEMPTS = 1000;

const decodeInterfaceType = Schema.decodeUnknownOption(UsageInterfaceType);

export const participantStage = (
  stageTypes: ReadonlyArray<unknown>,
  index: unknown,
): ParticipantStage | undefined => {
  if (
    !Predicate.isNumber(index) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > MAX_STAGE_INDEX
  ) {
    return undefined;
  }
  return Option.getOrUndefined(
    Option.map(decodeInterfaceType(stageTypes[index]), (interfaceType) => ({
      stage_index: index,
      interface_type: interfaceType,
    })),
  );
};

type LogSettings = {
  readonly telemetry: boolean;
  readonly level: LogLevelName;
};

const startParticipantLogs = (
  sessionToken: string,
  settings: LogSettings,
): (() => void) =>
  startBrowserLogs('participant', {
    enabled: settings.telemetry,
    level: settings.level,
    credentials: 'omit',
    headers: () => ({ [PARTICIPANT_SESSION_HEADER]: sessionToken }),
  });

export function useParticipantLogs(
  sessionToken: string,
  level: LogLevelName | null,
): boolean {
  useEffect(
    () =>
      startParticipantLogs(sessionToken, {
        telemetry: level !== null,
        level: level ?? 'None',
      }),
    [sessionToken, level],
  );
  return level !== null;
}

export type PublicStatus = () => Promise<
  Pick<InstanceStatus, 'telemetry' | 'logLevel'>
>;

const readPublicStatus: PublicStatus = () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(RpcClient.make(StatusRpcs, { flatten: true }), (client) =>
        client('status', undefined),
      ),
    ).pipe(Effect.provide(CredentiallessProtocol)),
  );

export function useStatusParticipantLogs(
  sessionToken: string,
  readStatus: PublicStatus = readPublicStatus,
): void {
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    const start = (settings: LogSettings) => {
      if (!cancelled) stop = startParticipantLogs(sessionToken, settings);
    };
    readStatus().then(
      (status) =>
        start({ telemetry: status.telemetry, level: status.logLevel }),
      () => start({ telemetry: false, level: 'None' }),
    );
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [sessionToken, readStatus]);
}

export const logSessionLoadFailed = (code: FaultCode): void =>
  logParticipant({
    message: 'Interview session failed to load',
    level: 'Error',
    attributes: { error_code: code },
  });

export const logAnswerSaveFailed = (
  stage: ParticipantStage,
  code: FaultCode,
  attempts: number,
): void =>
  logParticipant({
    message: 'Answer save failed',
    level: 'Error',
    attributes: {
      ...stage,
      error_code: code,
      attempt_count: Math.min(Math.max(attempts, 1), MAX_ATTEMPTS),
    },
  });

export const logAnswerSaveRetried = (
  stage: ParticipantStage,
  attempts: number,
): void =>
  logParticipant({
    message: 'Answer save succeeded after retrying',
    level: 'Warn',
    attributes: {
      ...stage,
      attempt_count: Math.min(Math.max(attempts, 1), MAX_ATTEMPTS),
    },
  });

export const logAssetFailed = (
  stage: ParticipantStage,
  code: FaultCode,
): void =>
  logParticipant({
    message: 'Asset failed to load',
    level: 'Error',
    attributes: { ...stage, error_code: code },
  });

export function watchParticipantConnection(
  currentStage: () => ParticipantStage | undefined,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  now: () => number = Date.now,
): () => void {
  let lostAt: number | undefined;
  const onOffline = () => {
    if (lostAt !== undefined) return;
    lostAt = now();
    const stage = currentStage();
    if (stage === undefined) return;
    logParticipant({
      message: 'Participant connection lost',
      level: 'Warn',
      attributes: stage,
    });
  };
  const onOnline = () => {
    if (lostAt === undefined) return;
    const duration = Math.min(Math.max(now() - lostAt, 0), MAX_DURATION_MS);
    lostAt = undefined;
    const stage = currentStage();
    if (stage === undefined) return;
    logParticipant({
      message: 'Participant connection restored',
      level: 'Info',
      attributes: { ...stage, duration_ms: duration },
    });
  };
  target.addEventListener('offline', onOffline);
  target.addEventListener('online', onOnline);
  return () => {
    target.removeEventListener('offline', onOffline);
    target.removeEventListener('online', onOnline);
  };
}

const observeException = (
  stageTypes: ReadonlyArray<unknown>,
  properties: unknown,
): void => {
  if (!Predicate.isObject(properties)) return;
  const feature = Predicate.hasProperty(properties, 'feature')
    ? properties.feature
    : undefined;
  const stage = participantStage(
    stageTypes,
    Predicate.hasProperty(properties, 'stage_index')
      ? properties.stage_index
      : undefined,
  );
  if (stage === undefined) return;
  if (feature === 'stage-error-boundary') {
    logParticipant({
      message: 'Stage failed to render',
      level: 'Error',
      attributes: stage,
    });
  } else if (feature === 'information-media') {
    logAssetFailed(stage, 'media');
  }
};

export const faultObservingClient = (
  inner: AnalyticsClient | undefined,
  stageTypes: ReadonlyArray<unknown>,
): AnalyticsClient => ({
  capture: (event, properties) => inner?.capture(event, properties),
  captureException: (error, properties) => {
    observeException(stageTypes, properties);
    return inner?.captureException(error, properties);
  },
  register: (properties) => inner?.register(properties),
});
