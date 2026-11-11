import { describe, expect, it } from 'vitest';

import { describeFixTextEdits } from '../describeFix';
import { applyOperations, fixFits } from '../fixEngine';
import { readPath } from '../fixPath';
import { editProtocol, recordFix } from '../protocolFix';
import { makeProtocol, op } from './fixtures';

/**
 * The engine's rules, each checked at every place that has to keep it. The
 * slice-level halves of the same rules are in
 * `ducks/modules/__tests__/protocolReviewRules.test.ts`.
 */

/** JSON nested deeper than a recursive walk of it can go. */
const DEEP = `${'['.repeat(100_000)}${']'.repeat(100_000)}`;

describe('A: a model-written fix never throws past the engine', () => {
  it('editProtocol answers invalid for a fix that breaks what normalisation reads', async () => {
    await expect(
      editProtocol(makeProtocol(), [op('set', '/stages', {})]),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it('editProtocol answers, rather than throws, for a value too deep to walk', async () => {
    const result = await editProtocol(makeProtocol(), [
      { op: 'set', path: '/name', value: DEEP },
    ]);
    expect(result.ok).toBe(false);
  });

  it('applyOperations answers when a target already holds a value too deep to walk', () => {
    const written = applyOperations({ a: 1 }, [
      { op: 'set', path: '/a', value: DEEP },
    ]);
    if (!written.ok) throw new Error('setup');
    expect(() =>
      applyOperations(written.result, [op('set', '/a', 1)]),
    ).not.toThrow();
    expect(applyOperations(written.result, [op('set', '/a', 1)]).ok).toBe(
      false,
    );
  });

  it('fixFits answers when the targets it compares are too deep to walk', () => {
    const written = applyOperations({ a: 1 }, [
      { op: 'set', path: '/a', value: DEEP },
    ]);
    if (!written.ok) throw new Error('setup');
    const operations = [{ op: 'set' as const, path: '/a', value: DEEP }];
    expect(() =>
      fixFits(written.result, operations, [
        { op: 'set', present: true, value: written.result },
      ]),
    ).not.toThrow();
  });

  it('recordFix answers for edits that cannot be inverted', () => {
    const record = () =>
      recordFix(makeProtocol(), [
        { op: 'set', path: '/description', value: DEEP },
        op('set', '/description', 'plain'),
      ]);
    expect(record).not.toThrow();
    expect(record().targets).toBeNull();
  });

  it('describeFixTextEdits answers for any value', () => {
    expect(() =>
      describeFixTextEdits(makeProtocol(), [
        { op: 'set', path: '/stages/names/prompts/p1/text', value: DEEP },
        { op: 'set', path: '/stages/names/label/en', value: '{oops' },
      ]),
    ).not.toThrow();
  });
});

describe('C: an id-aware path reaches the member with that id, or nothing', () => {
  // Stages have ids, so `0` can only ever be a stage's id.
  const stages = () => ({
    stages: [
      { id: 'first', title: 'Hello' },
      { id: 'second', title: 'Hello' },
    ],
  });

  it('does not read an index in an array whose members have ids', () => {
    expect(readPath(stages(), ['stages', '0', 'title'])).toEqual({
      found: false,
    });
  });

  it('does not set, insert before or remove by index there either', () => {
    for (const operation of [
      op('set', '/stages/0/title', 'Changed'),
      op('insert', '/stages/0', { id: 'new' }),
      op('remove', '/stages/0'),
    ]) {
      expect(applyOperations(stages(), [operation])).toEqual({
        ok: false,
        failure: { kind: 'path_not_found', operation: 0 },
      });
    }
  });

  it('a fix recorded for the stage with id 0 no longer fits once that stage is gone', () => {
    const reviewed = {
      stages: [{ id: '0', title: 'Hello' }, ...stages().stages],
    };
    const operations = [op('set', '/stages/0/title', 'Better')];
    const recorded = applyOperations(reviewed, operations);
    if (!recorded.ok) throw new Error('setup');
    // The researcher deletes stage `0`; `first` is now at index 0, with the
    // same title the fix was recorded against.
    expect(fixFits(stages(), operations, recorded.targets)).toBe(false);
  });

  it('still reads indexes in arrays whose members have no ids', () => {
    expect(readPath({ options: ['x', 'y'] }, ['options', '1'])).toEqual({
      found: true,
      value: 'y',
    });
  });
});

describe('F: the preview shows every text change a fix makes', () => {
  it('expands a replaced localized object into the translations it changes', () => {
    const protocol = makeProtocol();
    const { operations } = recordFix(protocol, [
      op('set', '/stages/names/prompts/p1/text', { en: 'New wording' }),
    ]);
    expect(describeFixTextEdits(protocol, operations)).toEqual([
      {
        path: '/stages/names/prompts/p1/text/en',
        now: 'Name people',
        after: 'New wording',
        locale: 'en',
        otherTranslations: ['fr'],
      },
    ]);
  });

  it('gives one edit per changed translation, and names none left as they are when all change', () => {
    const protocol = makeProtocol();
    const { operations } = recordFix(protocol, [
      op('set', '/stages/names/prompts/p1/text', {
        en: 'New wording',
        fr: 'Nouveau texte',
      }),
    ]);
    expect(describeFixTextEdits(protocol, operations)).toEqual([
      {
        path: '/stages/names/prompts/p1/text/en',
        now: 'Name people',
        after: 'New wording',
        locale: 'en',
        otherTranslations: [],
      },
      {
        path: '/stages/names/prompts/p1/text/fr',
        now: 'Nommez',
        after: 'Nouveau texte',
        locale: 'fr',
        otherTranslations: [],
      },
    ]);
  });

  it('shows a new localized text, which has nothing now', () => {
    const protocol = makeProtocol();
    const { operations } = recordFix(protocol, [
      op('set', '/stages/welcome/introductionPanel', {
        en: 'Before you start',
      }),
    ]);
    expect(describeFixTextEdits(protocol, operations)).toEqual([
      {
        path: '/stages/welcome/introductionPanel/en',
        now: null,
        after: 'Before you start',
        locale: 'en',
        otherTranslations: [],
      },
    ]);
    const label = recordFix(protocol, [
      op('set', '/codebook/node/person/variables/freq/options/0/label', {
        en: 'Very often',
      }),
    ]);
    expect(describeFixTextEdits(protocol, label.operations)).toEqual([
      {
        path: '/codebook/node/person/variables/freq/options/0/label/en',
        now: 'Often',
        after: 'Very often',
        locale: 'en',
        otherTranslations: ['fr'],
      },
    ]);
  });
});
