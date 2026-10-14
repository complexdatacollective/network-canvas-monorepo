import { beforeEach, describe, expect, it } from 'vitest';

import type { ParticipantLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import {
  createAssetObserver,
  isStorageUrl,
  participantStage,
  renderedStep,
  watchParticipantConnection,
} from '../participantLogs.ts';

const STAGE_TYPES = ['Information', 'NameGenerator', 'Sociogram'];

const logged: ParticipantLogEntry[] = [];
const log = (entry: ParticipantLogEntry) => {
  logged.push(entry);
};

const stageOf = (element?: Element) =>
  participantStage(STAGE_TYPES, renderedStep(element));

const showStage = (step: number): HTMLElement => {
  const container = document.createElement('div');
  container.setAttribute('data-stage-step', String(step));
  document.body.append(container);
  return container;
};

beforeEach(() => {
  logged.length = 0;
  document.body.replaceChildren();
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
    showStage(1);
    const stop = watchParticipantConnection(log, stageOf, target, () => now);
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

  it('logs the restoration of a logged loss on the stage the loss was logged on, even between stages', () => {
    const target = new EventTarget();
    let now = 10_000;
    const lostOn = showStage(1);
    const stop = watchParticipantConnection(log, stageOf, target, () => now);
    target.dispatchEvent(new Event('offline'));
    lostOn.remove();
    now += 2_500;
    target.dispatchEvent(new Event('online'));
    showStage(0);
    target.dispatchEvent(new Event('online'));
    stop();

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
          duration_ms: 2_500,
        },
      },
    ]);
  });

  it('logs no restoration for a loss it could not log, while no stage was shown', () => {
    const target = new EventTarget();
    let now = 10_000;
    const stop = watchParticipantConnection(log, stageOf, target, () => now);
    target.dispatchEvent(new Event('offline'));
    showStage(1);
    now += 4_200;
    target.dispatchEvent(new Event('online'));
    target.dispatchEvent(new Event('offline'));
    now += 1_000;
    target.dispatchEvent(new Event('online'));
    stop();

    expect(logged.map((entry) => entry.message)).toEqual([
      'Participant connection lost',
      'Participant connection restored',
    ]);
    expect(logged[1]?.attributes).toEqual({
      stage_index: 1,
      interface_type: 'NameGenerator',
      duration_ms: 1_000,
    });
  });
});

const GENERATED_SVG = 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E';

const isStoredAsset = (source: string) =>
  isStorageUrl(source) || source === GENERATED_SVG;

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
  const failToLoad = (element: HTMLElement, parent: HTMLElement) => {
    parent.append(element);
    element.dispatchEvent(new Event('error'));
    element.remove();
  };

  it('logs stored images, audio and video sources that fail to load, on the stage shown', () => {
    const shown = showStage(1);
    const stop = createAssetObserver(log, stageOf).watch(isStoredAsset);
    const image = document.createElement('img');
    image.setAttribute('src', '/storage/abc');
    const audio = document.createElement('audio');
    audio.setAttribute('src', '/storage/def');
    const video = document.createElement('video');
    const source = document.createElement('source');
    source.setAttribute('src', '/storage/ghi');
    video.append(source);
    shown.append(video);
    const svg = document.createElement('img');
    svg.setAttribute('src', GENERATED_SVG);

    failToLoad(image, shown);
    failToLoad(audio, shown);
    source.dispatchEvent(new Event('error'));
    video.remove();
    failToLoad(svg, shown);
    stop();
    failToLoad(image, shown);

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
    const exiting = showStage(1);
    showStage(2);
    const stop = createAssetObserver(log, stageOf).watch(isStoredAsset);
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
    const shown = showStage(1);
    const stop = createAssetObserver(log, stageOf).watch(isStoredAsset);
    const elsewhere = document.createElement('img');
    elsewhere.setAttribute('src', 'https://tiles.example.org/1.png');
    const inline = document.createElement('img');
    inline.setAttribute('src', 'data:image/svg+xml,<svg/>');
    failToLoad(elsewhere, shown);
    failToLoad(inline, shown);
    failToLoad(document.createElement('div'), shown);
    stop();
    expect(logged).toEqual([]);
  });
});

describe('an asset request', () => {
  it('reports its failure once, on the stage shown when it was requested', () => {
    const requesting = showStage(1);
    const report = createAssetObserver(log, stageOf).atRequest();
    requesting.remove();
    showStage(2);

    report('not_found');

    expect(logged).toEqual([
      {
        message: 'Asset failed to load',
        level: 'Error',
        attributes: {
          stage_index: 1,
          interface_type: 'NameGenerator',
          error_code: 'not_found',
        },
      },
    ]);
  });

  it('reports nothing when no stage was shown', () => {
    createAssetObserver(log, stageOf).atRequest()('transport');
    expect(logged).toEqual([]);
  });
});
