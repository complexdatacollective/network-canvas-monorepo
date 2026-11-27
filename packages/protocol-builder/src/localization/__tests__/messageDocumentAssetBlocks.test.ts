import { describe, expect, it } from 'vitest';

import { assetBlockAttributes } from '@codaco/fresco-ui/testing/assetBlock';

import {
  documentToMessage,
  type MessageDocumentFormat,
  MessageDocumentProblem,
  messageToDocument,
} from '../messageDocument';

const WITH_BLOCKS: MessageDocumentFormat = {
  markdown: true,
  singleLine: false,
  assetBlocks: true,
};
const WITHOUT_BLOCKS: MessageDocumentFormat = {
  markdown: true,
  singleLine: false,
};

const toDocument = (message: string, format = WITH_BLOCKS) =>
  messageToDocument(message, format);

const roundTrip = (message: string, format = WITH_BLOCKS) =>
  documentToMessage(toDocument(message, format), format).message;

/** Why the message cannot be shown in the editor, if it cannot. */
const problemOf = (message: string, format = WITH_BLOCKS) => {
  try {
    toDocument(message, format);
  } catch (error) {
    if (error instanceof MessageDocumentProblem) return error.kind;
    throw error;
  }
  return undefined;
};

describe('a message holding asset blocks', () => {
  it('shows an asset image as a block in the editor’s document', () => {
    const document = toDocument('![A map](asset:a1?size=small)');
    expect(document.content).toEqual([
      {
        type: 'assetBlock',
        attrs: assetBlockAttributes({ description: 'A map', size: 'small' }),
      },
    ]);
  });

  it('shows it as the description alone when the field holds no blocks', () => {
    const document = toDocument('![A map](asset:a1)', WITHOUT_BLOCKS);
    expect(JSON.stringify(document)).not.toContain('assetBlock');
  });

  it('keeps blocks and dynamic values through the editor and back', () => {
    const message = [
      '# Hello {name}',
      '',
      '![A map](asset:a1?size=large&loop=false)',
      '',
      'Meet {name} here.',
      '',
      '![](asset:a2?autoplay=false)',
    ].join('\n');

    const document = toDocument(message);
    expect(
      document.content?.flatMap((node) =>
        node.type === 'assetBlock' ? [node.attrs?.assetId] : [],
      ),
    ).toEqual(['a1', 'a2']);
    expect(roundTrip(message)).toBe(message);
  });

  it('keeps a value in the text around a block as a placeholder', () => {
    const document = toDocument('Hi {name}\n\n![](asset:a1)');
    expect(document.content?.[0]?.content?.at(-1)).toEqual({
      type: 'inlineValue',
      attrs: { id: 'name' },
    });
    expect(document.content?.[1]?.type).toBe('assetBlock');
  });

  it.each([
    ['its description', '![Hello {name}](asset:a1)'],
    ['its address', '![A map](asset:{name})'],
  ])('cannot be shown with a value in %s', (_kind, message) => {
    expect(problemOf(message)).toBe('valueInLinkAddress');
  });

  it('does not refuse a value in an image’s description where blocks are not held', () => {
    expect(() =>
      toDocument('![Hello {name}](asset:a1)', WITHOUT_BLOCKS),
    ).not.toThrow();
  });
});

// A file anywhere but in a paragraph of the text's own would be written back
// as its description, so the message is refused instead, as validation
// reports it.
describe('a file written where the editor holds no block', () => {
  it.each([
    ['a heading', '# ![A](asset:one)'],
    ['a link', '[![A](asset:one)](https://example.com)'],
    ['emphasis', '*![A](asset:one)*'],
    ['a reference', '![A][map]\n\n[map]: asset:one'],
    ['a heading, its colon escaped', '# ![A](asset\\:one)'],
    ['a heading, its colon a numbered character', '# ![A](asset&#58;one)'],
  ])('cannot be shown in %s', (_where, message) => {
    expect(problemOf(message)).toBe('misplacedFile');
  });

  it.each([
    ['a paragraph of its own', 'Before\n\n![A](asset:one)\n\nAfter'],
    ['a sentence', 'See ![A](asset:one) here'],
    ['an item of a list', '- one\n- ![A](asset:one)'],
    [
      'a branch of a logic block',
      '{node_isParticipant, select, true {![A](asset:one)} other {![B](asset:two)}}',
    ],
    [
      'the words beside a logic block',
      '{node_isParticipant, select, true {One} other {Other}}\n\n![A](asset:one)',
    ],
  ])('is shown in %s', (_where, message) => {
    expect(problemOf(message)).toBeUndefined();
  });

  it('is its description, as before, in text not declared to hold blocks', () => {
    expect(
      problemOf(
        '{node_isParticipant, select, true {![A](asset:one)} other {B}}',
        WITHOUT_BLOCKS,
      ),
    ).toBeUndefined();
    expect(problemOf('# ![A](asset:one)', WITHOUT_BLOCKS)).toBeUndefined();
  });
});
