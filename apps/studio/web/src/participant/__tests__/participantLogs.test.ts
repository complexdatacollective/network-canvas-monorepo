import { beforeEach, describe, expect, it } from 'vitest';

import type { ParticipantLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import {
  type ParticipantStage,
  participantStage,
  watchParticipantConnection,
  watchParticipantMedia,
} from '../participantLogs.ts';

const STAGE_TYPES = ['Information', 'NameGenerator', 'Sociogram'];

const logged: ParticipantLogEntry[] = [];
const log = (entry: ParticipantLogEntry) => {
  logged.push(entry);
};

let step = 0;
const currentStage = (): ParticipantStage | undefined =>
  participantStage(STAGE_TYPES, step);

beforeEach(() => {
  logged.length = 0;
  step = 0;
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
    step = 1;
    const stop = watchParticipantConnection(
      log,
      currentStage,
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

describe('the participant media watcher', () => {
  const failToLoad = (element: HTMLElement) => {
    document.body.append(element);
    element.dispatchEvent(new Event('error'));
    element.remove();
  };

  it('logs stored images, audio and video sources that fail to load, on the stage shown', () => {
    step = 1;
    const stop = watchParticipantMedia(log, currentStage);
    const image = document.createElement('img');
    image.setAttribute('src', '/storage/abc');
    const audio = document.createElement('audio');
    audio.setAttribute('src', '/storage/def');
    const video = document.createElement('video');
    const source = document.createElement('source');
    source.setAttribute('src', '/storage/ghi');
    video.append(source);
    document.body.append(video);

    failToLoad(image);
    failToLoad(audio);
    source.dispatchEvent(new Event('error'));
    video.remove();
    stop();
    failToLoad(image);

    const asset = {
      message: 'Asset failed to load',
      level: 'Error',
      attributes: {
        stage_index: 1,
        interface_type: 'NameGenerator',
        error_code: 'media',
      },
    };
    expect(logged).toEqual([asset, asset, asset]);
  });

  it('ignores media that is not Studio’s stored asset', () => {
    const stop = watchParticipantMedia(log, currentStage);
    const elsewhere = document.createElement('img');
    elsewhere.setAttribute('src', 'https://tiles.example.org/1.png');
    const inline = document.createElement('img');
    inline.setAttribute('src', 'data:image/svg+xml,<svg/>');
    failToLoad(elsewhere);
    failToLoad(inline);
    failToLoad(document.createElement('div'));
    stop();
    expect(logged).toEqual([]);
  });
});
