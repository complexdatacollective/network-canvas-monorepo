import { describe, expect, it } from 'vitest';

import { isSvgFile, readSvgFile, SvgFileTooLargeError } from '../open';

function makeSvgFile(
  name: string,
  contents = '<svg></svg>',
  type = 'image/svg+xml',
) {
  return new File([contents], name, { type });
}

describe('readSvgFile', () => {
  it('resolves the text contents of a well-formed SVG file', async () => {
    const file = makeSvgFile('background.svg', '<svg><rect/></svg>');

    await expect(readSvgFile(file)).resolves.toBe('<svg><rect/></svg>');
  });

  it('throws a typed error for a file over the size guard', async () => {
    const oversized = Object.defineProperty(
      makeSvgFile('background.svg'),
      'size',
      { value: 5 * 1024 * 1024 + 1 },
    );

    await expect(readSvgFile(oversized)).rejects.toThrow(SvgFileTooLargeError);
  });

  it('accepts a file exactly at the size guard', async () => {
    const atLimit = Object.defineProperty(
      makeSvgFile('background.svg'),
      'size',
      { value: 5 * 1024 * 1024 },
    );

    await expect(readSvgFile(atLimit)).resolves.toBe('<svg></svg>');
  });

  it('reports the offending file size on the thrown error', async () => {
    const oversized = Object.defineProperty(
      makeSvgFile('background.svg'),
      'size',
      { value: 5 * 1024 * 1024 + 42 },
    );

    try {
      await readSvgFile(oversized);
      expect.unreachable('readSvgFile should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SvgFileTooLargeError);
      if (error instanceof SvgFileTooLargeError) {
        expect(error.fileSize).toBe(5 * 1024 * 1024 + 42);
        expect(error.reason).toBe('too-large');
      }
    }
  });
});

describe('isSvgFile', () => {
  it('accepts a file with the SVG mime type', () => {
    expect(isSvgFile(makeSvgFile('background.svg'))).toBe(true);
  });

  it('accepts a file with a .svg extension but no mime type (drag-drop sources)', () => {
    expect(isSvgFile(makeSvgFile('background.svg', '<svg/>', ''))).toBe(true);
  });

  it('accepts a .SVG extension case-insensitively', () => {
    expect(isSvgFile(makeSvgFile('background.SVG', '<svg/>', ''))).toBe(true);
  });

  it('rejects a non-SVG file with an unrelated extension and mime type', () => {
    expect(
      isSvgFile(makeSvgFile('background.png', 'not svg', 'image/png')),
    ).toBe(false);
  });

  it('rejects a file with neither a matching mime type nor extension', () => {
    expect(isSvgFile(makeSvgFile('notes.txt', 'hello', 'text/plain'))).toBe(
      false,
    );
  });
});
