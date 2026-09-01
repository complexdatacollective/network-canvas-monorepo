import { describe, expect, it } from 'vitest';

import { matchLabel, segmentLabel } from '../everythingBarMatching';

/**
 * The matcher's whole job is to find a match in folded space and report it in
 * the ORIGINAL string's coordinates. Every assertion below therefore checks the
 * substring the returned range actually covers, not just that a match happened
 * — a component that folded and then highlighted by folded index would still
 * "match" every one of these labels.
 */
const covered = (label: string, query: string) =>
  matchLabel(label, query)?.map((range) =>
    label.slice(range.start, range.end),
  ) ?? null;

describe('matchLabel', () => {
  it('matches a plain substring anywhere in the label', () => {
    expect(covered('Participants', 'parti')).toEqual(['Parti']);
    expect(covered('Manage participants', 'parti')).toEqual(['parti']);
  });

  it('ignores case', () => {
    expect(covered('Activity log', 'ACTIVITY')).toEqual(['Activity']);
  });

  it('ignores diacritics and highlights the accented original', () => {
    expect(covered('Anàlisi de xarxes', 'analisi')).toEqual(['Anàlisi']);
    expect(covered('Rôles d’équipe', 'roles')).toEqual(['Rôles']);
  });

  it('maps the highlight back across a fold that changes length', () => {
    // The label carries a combining acute, so folding it is one character
    // shorter than the original: a folded-space index would slice mid-word.
    const label = 'Café project';
    expect(covered(label, 'cafe project')).toEqual([label]);
  });

  it('matches initials across word starts', () => {
    expect(covered('Community Recovery Panel 2027', 'crp')).toEqual([
      'C',
      'R',
      'P',
    ]);
    expect(covered('Community Recovery Panel 2027', 'rp')).toEqual(['R', 'P']);
  });

  it('treats a camel-case boundary as a word start', () => {
    expect(covered('openStudySettings', 'oss')).toEqual(['o', 'S', 'S']);
  });

  it('matches inside labels that have no word boundaries at all', () => {
    expect(covered('参加者一覧', '者一')).toEqual(['者一']);
    expect(covered('Teilnehmerverwaltung', 'verwaltung')).toEqual([
      'verwaltung',
    ]);
  });

  it('returns null when nothing matches', () => {
    expect(matchLabel('Activity log', 'zzz')).toBeNull();
    // Initials only match a run of consecutive word starts.
    expect(matchLabel('Community Recovery Panel', 'cp')).toBeNull();
  });

  it('matches everything and highlights nothing for an empty query', () => {
    expect(matchLabel('Activity log', '   ')).toEqual([]);
  });
});

describe('segmentLabel', () => {
  it('splits the label into matched and unmatched segments in order', () => {
    const label = 'Manage participants';
    const ranges = matchLabel(label, 'parti') ?? [];

    expect(segmentLabel(label, ranges)).toEqual([
      { text: 'Manage ', matched: false },
      { text: 'parti', matched: true },
      { text: 'cipants', matched: false },
    ]);
  });

  it('reproduces the label exactly, so no character is lost or duplicated', () => {
    const label = 'Community Recovery Panel 2027';
    const segments = segmentLabel(label, matchLabel(label, 'crp') ?? []);

    expect(segments.map((segment) => segment.text).join('')).toBe(label);
  });
});
