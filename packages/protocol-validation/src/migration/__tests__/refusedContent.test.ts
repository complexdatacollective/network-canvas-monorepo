import { describe, expect, it } from 'vitest';

import { findRefusedContent } from '../refusedContent.ts';

const protocol = {
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [
    {
      label: { en: 'Friends' },
      prompts: [{ text: { en: ' ' } }],
    },
  ],
};

const blankPrompt = {
  code: 'custom',
  path: ['stages', 0, 'prompts', 0, 'text', 'en'],
  message: 'Text cannot be blank.',
};

// Anything that is not the protocol's own content left empty may be a fault in
// a migration of ours, and must stay one so the host reports it.
describe('findRefusedContent', () => {
  it('finds a prompt the protocol left blank', () => {
    expect(findRefusedContent(protocol, [blankPrompt])).toEqual([
      {
        path: blankPrompt.path,
        place: 'Stage “Friends”, prompt 1',
        message: 'Text cannot be blank.',
      },
    ]);
  });

  it('does not claim a place the migration writes itself', () => {
    expect(
      findRefusedContent(protocol, [
        { code: 'custom', path: ['stages', 0, 'label', 'en'], message: 'x' },
      ]),
    ).toBeUndefined();
  });

  it('does not claim a prompt that has text, whatever else is wrong with it', () => {
    const withText = structuredClone(protocol);
    withText.stages[0]!.prompts[0]!.text.en = 'Who are your friends?';

    expect(findRefusedContent(withText, [blankPrompt])).toBeUndefined();
  });

  it('claims nothing when any one issue is not refused content', () => {
    expect(
      findRefusedContent(protocol, [
        blankPrompt,
        { code: 'invalid_type', path: ['codebook'], message: 'Required' },
      ]),
    ).toBeUndefined();
  });

  it('claims nothing when there are no issues', () => {
    expect(findRefusedContent(protocol, [])).toBeUndefined();
  });
});
