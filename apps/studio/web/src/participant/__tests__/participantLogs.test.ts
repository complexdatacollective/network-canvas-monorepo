import { beforeEach, describe, expect, it } from 'vitest';

import type { ParticipantLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import {
  type ParticipantStage,
  isStorageUrl,
  participantStage,
  renderedStep,
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

  it('names the finish screen after the last authored stage by its index alone', () => {
    expect(participantStage(STAGE_TYPES, STAGE_TYPES.length)).toEqual({
      stage_index: STAGE_TYPES.length,
    });
  });

  it('is nothing for an index or a type outside what Studio declares', () => {
    expect(
      participantStage(STAGE_TYPES, STAGE_TYPES.length + 1),
    ).toBeUndefined();
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

const GENERATED_SVG = 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E';

const isStoredAsset = (source: string) =>
  isStorageUrl(source) || source === GENERATED_SVG;

const stageOfElement = (element: Element) =>
  participantStage(STAGE_TYPES, renderedStep(element) ?? step);

describe('the rendered stage', () => {
  it('is read from the stage container an element sits in, or the one on the page', () => {
    const container = document.createElement('div');
    container.setAttribute('data-stage-step', '2');
    const inside = document.createElement('img');
    container.append(inside);
    document.body.append(container);

    expect(renderedStep(inside)).toBe(2);
    expect(renderedStep()).toBe(2);
    container.setAttribute('data-stage-step', 'not-a-step');
    expect(renderedStep(inside)).toBeUndefined();
    container.remove();
    expect(renderedStep()).toBeUndefined();
  });
});

describe('the participant media watcher', () => {
  const failToLoad = (
    element: HTMLElement,
    parent: HTMLElement = document.body,
  ) => {
    parent.append(element);
    element.dispatchEvent(new Event('error'));
    element.remove();
  };

  it('logs stored images, audio and video sources that fail to load, on the stage shown', () => {
    step = 1;
    const stop = watchParticipantMedia(log, stageOfElement, isStoredAsset);
    const image = document.createElement('img');
    image.setAttribute('src', '/storage/abc');
    const audio = document.createElement('audio');
    audio.setAttribute('src', '/storage/def');
    const video = document.createElement('video');
    const source = document.createElement('source');
    source.setAttribute('src', '/storage/ghi');
    video.append(source);
    document.body.append(video);
    const svg = document.createElement('img');
    svg.setAttribute('src', GENERATED_SVG);

    failToLoad(image);
    failToLoad(audio);
    source.dispatchEvent(new Event('error'));
    video.remove();
    failToLoad(svg);
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
    expect(logged).toEqual([asset, asset, asset, asset]);
  });

  it('names the stage the failing element is rendered in, not the stage the host has moved on to', () => {
    step = 2;
    const stop = watchParticipantMedia(log, stageOfElement, isStoredAsset);
    const exiting = document.createElement('div');
    exiting.setAttribute('data-stage-step', '1');
    document.body.append(exiting);
    const image = document.createElement('img');
    image.setAttribute('src', '/storage/abc');

    failToLoad(image, exiting);
    exiting.remove();
    stop();

    expect(logged.map((entry) => entry.attributes)).toEqual([
      { stage_index: 1, interface_type: 'NameGenerator', error_code: 'media' },
    ]);
  });

  it('ignores media that is not Studio’s stored asset', () => {
    const stop = watchParticipantMedia(log, stageOfElement, isStoredAsset);
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
