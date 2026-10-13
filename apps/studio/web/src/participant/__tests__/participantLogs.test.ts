import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParticipantLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import {
  faultObservingClient,
  participantStage,
  watchParticipantConnection,
} from '../participantLogs.ts';

const logged = vi.hoisted((): ParticipantLogEntry[] => []);

vi.mock('../../runtime/browserLogs.ts', () => ({
  logParticipant: (entry: ParticipantLogEntry) => {
    logged.push(entry);
  },
  startBrowserLogs: () => () => undefined,
}));

const STAGE_TYPES = ['Information', 'NameGenerator', 'Sociogram'];

beforeEach(() => {
  logged.length = 0;
});

describe('a participant stage', () => {
  it('names a stage by its index and declared interface type only', () => {
    expect(participantStage(STAGE_TYPES, 2)).toEqual({
      stage_index: 2,
      interface_type: 'Sociogram',
    });
  });

  it('is nothing for an index or a type outside what Studio declares', () => {
    expect(participantStage(STAGE_TYPES, 7)).toBeUndefined();
    expect(participantStage(STAGE_TYPES, -1)).toBeUndefined();
    expect(participantStage(STAGE_TYPES, '1')).toBeUndefined();
    expect(participantStage(['A study about Jane'], 0)).toBeUndefined();
  });
});

describe('the participant connection watcher', () => {
  it('logs a lost connection once and how long it took to come back', () => {
    const target = new EventTarget();
    let now = 10_000;
    const stop = watchParticipantConnection(
      () => participantStage(STAGE_TYPES, 1),
      target,
      () => now,
    );
    target.dispatchEvent(new Event('offline'));
    target.dispatchEvent(new Event('offline'));
    now += 4_200;
    target.dispatchEvent(new Event('online'));
    target.dispatchEvent(new Event('online'));
    stop();
    target.dispatchEvent(new Event('offline'));

    expect(logged).toEqual([
      {
        message: 'Participant connection lost',
        level: 'Warn',
        attributes: { stage_index: 1, interface_type: 'NameGenerator' },
      },
      {
        message: 'Participant connection restored',
        level: 'Info',
        attributes: {
          stage_index: 1,
          interface_type: 'NameGenerator',
          duration_ms: 4_200,
        },
      },
    ]);
  });
});

describe('the fault-observing interview client', () => {
  it('logs a stage that failed to render and media that failed to load, and passes everything on', () => {
    const inner = {
      capture: vi.fn(),
      captureException: vi.fn(),
      register: vi.fn(),
    };
    const client = faultObservingClient(inner, STAGE_TYPES);
    const crash = new Error('Cannot read properties of undefined');

    client.captureException(crash, {
      feature: 'stage-error-boundary',
      stage_index: 2,
      stage_type: 'Sociogram',
      component_stack: 'at Sociogram',
    });
    client.captureException(new Error('video load failed: 4'), {
      feature: 'information-media',
      stage_index: 0,
    });
    client.captureException(new Error('locale'), {
      feature: 'locale-load',
      stage_index: 0,
    });
    client.capture('stage_entered', { stage_index: 1 });

    expect(logged).toEqual([
      {
        message: 'Stage failed to render',
        level: 'Error',
        attributes: { stage_index: 2, interface_type: 'Sociogram' },
      },
      {
        message: 'Asset failed to load',
        level: 'Error',
        attributes: {
          stage_index: 0,
          interface_type: 'Information',
          error_code: 'media',
        },
      },
    ]);
    expect(inner.captureException).toHaveBeenCalledTimes(3);
    expect(inner.capture).toHaveBeenCalledWith('stage_entered', {
      stage_index: 1,
    });
  });

  it('still logs when the study sends no usability events', () => {
    const client = faultObservingClient(undefined, STAGE_TYPES);
    client.captureException(new Error('boom'), {
      feature: 'stage-error-boundary',
      stage_index: 1,
    });
    expect(logged.map((entry) => entry.message)).toEqual([
      'Stage failed to render',
    ]);
  });
});
