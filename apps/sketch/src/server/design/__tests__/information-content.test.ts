// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { friendshipDesign } from '../__fixtures__/example.ts';
import { buildProtocol } from '../build.ts';
import { NOW, parseDesign } from './helpers.ts';

type Stage = { id: string; type: string; content?: Record<string, string> };

const compiled = async (title: string, text: string) => {
  const design = parseDesign({
    ...friendshipDesign,
    stages: friendshipDesign.stages.map((s) =>
      s.kind === 'information' && s.id === 'welcome'
        ? { ...s, content: text }
        : s,
    ),
  });
  const result = await buildProtocol(
    design,
    {
      protocolName: '',
      protocolDescription: '',
      stages: [{ stageKey: 'welcome', label: '', title, text }],
      prompts: [],
      questions: [],
    },
    { now: NOW },
  );
  const stage = (result.protocol.stages as unknown as Stage[]).find(
    (s) => s.id === 'welcome',
  );
  return { result, content: stage?.content };
};

describe('an Information screen compiles to one markdown text', () => {
  it('opens with its title as a heading, then its words', async () => {
    const { result, content } = await compiled(
      'Welcome',
      'Thank you for taking part.',
    );

    expect(content).toEqual({
      en: '# Welcome\n\nThank you for taking part.',
    });
    expect(result.validation.success).toBe(true);
  });

  it('escapes markdown characters in the title, so they read as the title’s own words', async () => {
    const { result, content } = await compiled(
      '# Big *news* [1]',
      'Some words.',
    );

    // Not emphasis, not a second heading marker, not a link.
    expect(content?.en).toBe('# \\# Big \\*news\\* \\[1\\]\n\nSome words.');
    expect(result.validation.success).toBe(true);
  });

  it('is only the heading when the screen has no words', async () => {
    const { result, content } = await compiled('Welcome', '');

    expect(content).toEqual({ en: '# Welcome' });
    expect(result.validation.success).toBe(true);
  });
});
