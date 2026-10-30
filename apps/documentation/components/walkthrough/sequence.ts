import type { Beat, BeatText, Chapter, Condition, Walkthrough } from './types';

export type PlacedBeat = { beat: Beat; chapter: Chapter };

const meets = (when: Condition | undefined, choices: Record<string, string>) =>
  !when ||
  Object.entries(when).every(([choice, option]) => choices[choice] === option);

export const visibleBeats = (
  walkthrough: Walkthrough,
  choices: Record<string, string>,
): PlacedBeat[] =>
  walkthrough.chapters.flatMap((chapter) =>
    chapter.beats
      .filter((beat) => meets(beat.when, choices))
      .map((beat) => ({ beat, chapter })),
  );

// A saved beat can vanish when the choice it depended on changes; fall back to
// the chapter it belonged to, then to the start.
export const resolveIndex = (
  walkthrough: Walkthrough,
  beats: PlacedBeat[],
  beatId: string | null,
) => {
  if (!beatId) return 0;
  const index = beats.findIndex(({ beat }) => beat.id === beatId);
  if (index !== -1) return index;
  const chapter = walkthrough.chapters.find((c) =>
    c.beats.some((beat) => beat.id === beatId),
  );
  const fallback = beats.findIndex((placed) => placed.chapter === chapter);
  return Math.max(fallback, 0);
};

export const firstBeatOf = (beats: PlacedBeat[], chapterId: string) =>
  beats.find(({ chapter }) => chapter.id === chapterId)?.beat.id ?? null;

export const chapterStatus = (
  beats: PlacedBeat[],
  index: number,
  chapterId: string,
) => {
  const own = beats
    .map((placed, i) => ({ placed, i }))
    .filter(({ placed }) => placed.chapter.id === chapterId);
  const first = own[0]?.i ?? Infinity;
  const last = own[own.length - 1]?.i ?? -Infinity;
  if (index > last) return 'done';
  if (index >= first) return 'current';
  return 'upcoming';
};

export const textFor = (text: BeatText, choices: Record<string, string>) => {
  if (typeof text === 'string') return text;
  const picked = choices[text.choice];
  return (
    (picked ? text.byOption[picked] : undefined) ??
    Object.values(text.byOption)[0] ??
    ''
  );
};
