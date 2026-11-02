import { describe, expect, it } from 'vitest';

import frescoDeployment from '~/walkthroughs/fresco-deployment/en';

import {
  chapterStatus,
  firstBeatOf,
  resolveIndex,
  textFor,
  visibleBeats,
} from '../sequence';
import type { Walkthrough } from '../types';

const scene = { kind: 'scene', scene: 'services' } as const;

const walkthrough: Walkthrough = {
  id: 'test',
  title: 'Test',
  description: '',
  chapters: [
    {
      id: 'one',
      title: 'One',
      tint: 'green',
      guide: '#one',
      beats: [
        {
          id: 'pick',
          type: 'choose',
          choice: 'path',
          text: 'Which way?',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          visual: scene,
        },
        {
          id: 'a1',
          type: 'do',
          when: { path: 'a' },
          text: 'A',
          confirm: 'Done',
          visual: scene,
        },
        {
          id: 'b1',
          type: 'do',
          when: { path: 'b' },
          text: 'B',
          confirm: 'Done',
          visual: scene,
        },
      ],
    },
    {
      id: 'two',
      title: 'Two',
      tint: 'blue',
      guide: '#two',
      beats: [
        {
          id: 'end',
          type: 'checkpoint',
          text: { choice: 'path', byOption: { a: 'Took A', b: 'Took B' } },
          confirm: 'OK',
          visual: scene,
        },
      ],
    },
  ],
};

const ids = (choices: Record<string, string>) =>
  visibleBeats(walkthrough, choices).map(({ beat }) => beat.id);

describe('visibleBeats', () => {
  it('hides beats whose choice is not made or made the other way', () => {
    expect(ids({})).toEqual(['pick', 'end']);
    expect(ids({ path: 'a' })).toEqual(['pick', 'a1', 'end']);
    expect(ids({ path: 'b' })).toEqual(['pick', 'b1', 'end']);
  });
});

describe('resolveIndex', () => {
  it('falls back to the start of the chapter when a beat is no longer shown', () => {
    const beats = visibleBeats(walkthrough, { path: 'b' });
    expect(resolveIndex(walkthrough, beats, 'a1')).toBe(0);
    expect(resolveIndex(walkthrough, beats, 'end')).toBe(2);
    expect(resolveIndex(walkthrough, beats, null)).toBe(0);
  });
});

describe('chapterStatus and firstBeatOf', () => {
  it('reports chapters before, at and after the current beat', () => {
    const beats = visibleBeats(walkthrough, { path: 'a' });
    expect(chapterStatus(beats, 2, 'one')).toBe('done');
    expect(chapterStatus(beats, 2, 'two')).toBe('current');
    expect(chapterStatus(beats, 0, 'two')).toBe('upcoming');
    expect(firstBeatOf(beats, 'two')).toBe('end');
  });
});

describe('textFor', () => {
  it('picks the variant for the option chosen', () => {
    const end = walkthrough.chapters[1]?.beats[0];
    if (!end) throw new Error('missing beat');
    expect(textFor(end.text, { path: 'b' })).toBe('Took B');
  });
});

describe('fresco-deployment', () => {
  const all = frescoDeployment.chapters.flatMap((c) => c.beats);

  it('has unique beat ids', () => {
    const beatIds = all.map((beat) => beat.id);
    expect(new Set(beatIds).size).toBe(beatIds.length);
  });

  it('only conditions beats on choices it offers, with options that exist', () => {
    const offered = new Map(
      all.flatMap((beat) =>
        beat.type === 'choose'
          ? [[beat.choice, beat.options.map((o) => o.id)] as const]
          : [],
      ),
    );
    for (const beat of all) {
      for (const [choice, option] of Object.entries(beat.when ?? {})) {
        expect(offered.get(choice)).toContain(option);
      }
    }
  });

  it('keeps the chapter ids the guide links to', () => {
    expect(frescoDeployment.chapters.map((c) => c.id)).toEqual([
      'start',
      'fork',
      'database',
      'netlify',
      'setup',
      'storage',
      'finish',
    ]);
  });
});
