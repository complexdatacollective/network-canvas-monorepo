import { Option, Predicate, Schema } from 'effect';
import { useEffect, useMemo } from 'react';

import type {
  FaultCode,
  LogLevelName,
  ParticipantLogEntry,
} from '@codaco/studio-contract/schema/browser-logs';
import { UsageInterfaceType } from '@codaco/studio-sync/jobs';

import {
  type BrowserLogHandle,
  createBrowserLogHandle,
} from '../runtime/browserLogs.ts';
import { participantLogTransport } from '../runtime/participantRuntime.ts';
import { type PublicStatus, readPublicStatus } from '../runtime/telemetry.ts';

export type ParticipantLog = (entry: ParticipantLogEntry) => void;

export type ParticipantStage = {
  readonly stage_index: number;
  readonly interface_type?: typeof UsageInterfaceType.Type;
};

const MAX_STAGE_INDEX = 10_000;

const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_ATTEMPTS = 1000;

const STORAGE_PATH = '/storage/';

const STAGE_STEP_ATTRIBUTE = 'data-stage-step';

const STEP = /^\d{1,5}$/;

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
  if (index === stageTypes.length) return { stage_index: index };
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

const configure = (
  handle: BrowserLogHandle<ParticipantLogEntry>,
  sessionToken: string,
  settings: LogSettings,
): void =>
  handle.configure({
    enabled: settings.telemetry,
    level: settings.level,
    ...participantLogTransport(sessionToken),
  });

const useSessionHandle = (sessionToken: string) =>
  useMemo(
    () => createBrowserLogHandle<ParticipantLogEntry>('participant'),
    [sessionToken],
  );

export function useParticipantLogs(
  sessionToken: string,
  level: LogLevelName | null,
): ParticipantLog {
  const handle = useSessionHandle(sessionToken);
  useEffect(() => {
    handle.activate();
    configure(handle, sessionToken, {
      telemetry: level !== null,
      level: level ?? 'None',
    });
    return handle.close;
  }, [handle, sessionToken, level]);
  return handle.log;
}

export function useStatusParticipantLogs(
  sessionToken: string,
  readStatus: PublicStatus = readPublicStatus,
): ParticipantLog {
  const handle = useSessionHandle(sessionToken);
  useEffect(() => {
    let current = true;
    handle.activate();
    const settle = (settings: LogSettings) => {
      if (current) configure(handle, sessionToken, settings);
    };
    readStatus().then(
      (status) =>
        settle({ telemetry: status.telemetry, level: status.logLevel }),
      () => settle({ telemetry: false, level: 'None' }),
    );
    return () => {
      current = false;
      handle.close();
    };
  }, [handle, sessionToken, readStatus]);
  return handle.log;
}

export const logSessionLoadFailed = (
  log: ParticipantLog,
  code: FaultCode,
): void =>
  log({
    message: 'Interview session failed to load',
    level: 'Error',
    attributes: { error_code: code },
  });

const boundedAttempts = (attempts: number): number =>
  Math.min(Math.max(attempts, 1), MAX_ATTEMPTS);

export const logAnswerSaveFailed = (
  log: ParticipantLog,
  stage: ParticipantStage,
  code: FaultCode,
  attempts: number,
): void =>
  log({
    message: 'Answer save failed',
    level: 'Error',
    attributes: {
      ...stage,
      error_code: code,
      attempt_count: boundedAttempts(attempts),
    },
  });

export const logAnswerSaveRetried = (
  log: ParticipantLog,
  stage: ParticipantStage,
  attempts: number,
): void =>
  log({
    message: 'Answer save succeeded after retrying',
    level: 'Warn',
    attributes: { ...stage, attempt_count: boundedAttempts(attempts) },
  });

const logAssetFailed = (
  log: ParticipantLog,
  stage: ParticipantStage,
  code: FaultCode,
): void =>
  log({
    message: 'Asset failed to load',
    level: 'Error',
    attributes: { ...stage, error_code: code },
  });

type EventTargetLike = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export function watchParticipantConnection(
  log: ParticipantLog,
  currentStage: () => ParticipantStage | undefined,
  target: EventTargetLike = window,
  now: () => number = Date.now,
): () => void {
  let lostAt: number | undefined;
  const onOffline = () => {
    if (lostAt !== undefined) return;
    const stage = currentStage();
    if (stage === undefined) return;
    lostAt = now();
    log({
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
    log({
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

export const renderedStep = (
  element?: Element | null,
  root: Pick<Document, 'querySelector'> = document,
): number | undefined => {
  const container =
    element === undefined || element === null
      ? root.querySelector(`[${STAGE_STEP_ATTRIBUTE}]`)
      : element.closest(`[${STAGE_STEP_ATTRIBUTE}]`);
  const step = container?.getAttribute(STAGE_STEP_ATTRIBUTE);
  return step !== null && step !== undefined && STEP.test(step)
    ? Number(step)
    : undefined;
};

export const isStorageUrl = (source: string): boolean => {
  if (!URL.canParse(source, window.location.origin)) return false;
  const url = new URL(source, window.location.origin);
  return (
    url.origin === window.location.origin &&
    url.pathname.startsWith(STORAGE_PATH)
  );
};

const mediaSource = (target: EventTarget | null): string | undefined => {
  if (target instanceof HTMLSourceElement) return target.src;
  if (
    target instanceof HTMLImageElement ||
    target instanceof HTMLMediaElement
  ) {
    return target.currentSrc || target.getAttribute('src') || undefined;
  }
  return undefined;
};

type StageOf = (element?: Element) => ParticipantStage | undefined;

export type AssetObserver = {
  readonly atRequest: () => (code: FaultCode) => void;
  readonly watch: (
    isStoredAsset: (source: string) => boolean,
    target?: EventTargetLike,
  ) => () => void;
};

export const createAssetObserver = (
  log: ParticipantLog,
  stageOf: StageOf,
): AssetObserver => {
  const report = (stage: ParticipantStage | undefined, code: FaultCode) => {
    if (stage !== undefined) logAssetFailed(log, stage, code);
  };
  return {
    atRequest: () => {
      const stage = stageOf();
      return (code) => report(stage, code);
    },
    watch: (isStoredAsset, target = window) => {
      const onError = (event: Event) => {
        const source = mediaSource(event.target);
        if (
          source === undefined ||
          !(event.target instanceof Element) ||
          !isStoredAsset(source)
        ) {
          return;
        }
        report(stageOf(event.target), 'media');
      };
      target.addEventListener('error', onError, true);
      return () => target.removeEventListener('error', onError, true);
    },
  };
};

export const logStageFailedToRender = (
  log: ParticipantLog,
  stage: ParticipantStage | undefined,
): void => {
  if (stage === undefined) return;
  log({ message: 'Stage failed to render', level: 'Error', attributes: stage });
};
