import { describe, expect, it } from 'vitest';

import type { BackgroundDocument } from '../../model/types';
import { fixtureDocument } from '../fixtures';
import { generatePythonScript } from '../python';
import { generateRScript } from '../r';

const defaultOpts = { layoutVariable: 'location', outputVariable: 'zone' };

// A label that would break a naive string embedding: embedded double quotes, a
// backslash, and a single quote.
const hostileLabel = 'He said "hi" \\ O\'Brien';
const hostileDocument: BackgroundDocument = {
  version: 1,
  title: 'Hostile labels',
  description: 'Escaping exercise.',
  elements: [],
  zones: [
    {
      id: 'h',
      label: hostileLabel,
      shape: 'rect',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
  ],
};

describe('golden script snapshots', () => {
  it('generates the Python script', () => {
    expect(
      generatePythonScript(fixtureDocument, defaultOpts),
    ).toMatchSnapshot();
  });

  it('generates the R script', () => {
    expect(generateRScript(fixtureDocument, defaultOpts)).toMatchSnapshot();
  });
});

describe('embedded opts defaults', () => {
  const opts = { layoutVariable: 'position', outputVariable: 'region' };

  it('Python embeds the layout and output defaults from opts', () => {
    const script = generatePythonScript(fixtureDocument, opts);
    expect(script).toContain('default="position"');
    expect(script).toContain('default="region"');
  });

  it('R embeds the layout and output defaults from opts', () => {
    const script = generateRScript(fixtureDocument, opts);
    expect(script).toContain('layout_variable <- "position"');
    expect(script).toContain('output_variable <- "region"');
  });
});

describe('label escaping', () => {
  // The emitted literal must be: "He said \"hi\" \\ O'Brien"
  const expectedLiteral = '"He said \\"hi\\" \\\\ O\'Brien"';

  it('Python escapes quotes and backslashes into a valid string literal', () => {
    expect(generatePythonScript(hostileDocument, defaultOpts)).toContain(
      expectedLiteral,
    );
  });

  it('R escapes quotes and backslashes into a valid string literal', () => {
    expect(generateRScript(hostileDocument, defaultOpts)).toContain(
      expectedLiteral,
    );
  });
});

describe('nul (U+0000) handling', () => {
  const nul = String.fromCharCode(0);
  const replacement = String.fromCharCode(0xfffd);
  const nulDocument: BackgroundDocument = {
    version: 1,
    title: 'Nul labels',
    description: '',
    elements: [],
    zones: [
      {
        id: 'n',
        label: `a${nul}b`,
        shape: 'rect',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ],
  };

  it('Python replaces U+0000 with U+FFFD and emits no \\x00 escape', () => {
    const script = generatePythonScript(nulDocument, defaultOpts);
    expect(script).not.toContain('\\x00');
    expect(script).toContain(`"a${replacement}b"`);
  });

  it('R replaces U+0000 with U+FFFD and emits no illegal \\x00 escape', () => {
    const script = generateRScript(nulDocument, defaultOpts);
    expect(script).not.toContain('\\x00');
    expect(script).toContain(`"a${replacement}b"`);
  });
});
