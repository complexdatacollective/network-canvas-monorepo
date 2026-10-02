import { describe, expect, it } from 'vitest';

import { readMessage } from '../../testing/i18n.ts';
import { readRosterFacts } from '../rosterFacts.ts';

const COMBINING_ACUTE = String.fromCharCode(0x301);

const read = (text: string, source: string) =>
  readRosterFacts({
    bytes: new TextEncoder().encode(text),
    contentType: source.endsWith('.csv') ? 'text/csv' : 'application/json',
    source,
  });

const readCsv = (text: string) => read(text, 'roster.csv');

const refusal = async (facts: ReturnType<typeof read>) => {
  const result = await facts;
  if (!('unreadable' in result)) throw new Error('The roster was accepted.');
  return readMessage(result.unreadable);
};

describe('readRosterFacts', () => {
  describe('headings', () => {
    it('refuses a heading with a space at the end, naming it', async () => {
      expect(await refusal(readCsv('name,"notes "\nAda,x\n'))).toBe(
        'the "notes " attribute cannot be used as a variable name: a name cannot be empty, start or end with a space, or contain line breaks, tabs or other control characters',
      );
    });

    it('refuses a JSON attribute name with a space at the start', async () => {
      expect(
        await refusal(
          read(
            JSON.stringify({ nodes: [{ attributes: { ' notes': 'x' } }] }),
            'roster.json',
          ),
        ),
      ).toContain('the " notes" attribute cannot be used as a variable name');
    });

    it('accepts a heading spelled with a decomposed accent, as written', async () => {
      const decomposed = `Cafe${COMBINING_ACUTE}`;

      expect(await readCsv(`${decomposed}\nespresso\n`)).toMatchObject({
        variableNames: [decomposed],
      });
    });

    it('reads an unquoted heading without the spaces round it, as the interview does', async () => {
      expect(await readCsv(' name ,age\nAda,36\n')).toMatchObject({
        variableNames: ['age', 'name'],
      });
    });

    it('lists headings named after Object.prototype members', async () => {
      expect(
        await readCsv('name,__proto__,constructor,toString\nAda,a,b,c\n'),
      ).toEqual({
        counts: { nodes: 1, edges: 0 },
        variableNames: ['__proto__', 'constructor', 'name', 'toString'],
      });
    });
  });

  describe('rows', () => {
    it('accepts blank lines between rows, which the interview skips', async () => {
      expect(await readCsv('name\nAda\n\nGrace\n\n')).toEqual({
        counts: { nodes: 2, edges: 0 },
        variableNames: ['name'],
      });
    });

    it.each([
      ['a cell too many', 'name,age\nAda,36,unexpected\n'],
      ['a cell too few', 'name,age\nAda,36\nGrace\n'],
    ])('refuses a row with %s', async (_label, text) => {
      expect(await refusal(readCsv(text))).toBe(
        'the selected file is not a readable network',
      );
    });

    it('names a JSON node by its place in the list of nodes', async () => {
      expect(
        await refusal(
          read(
            JSON.stringify({
              nodes: [
                { attributes: { name: 'Ada' } },
                { attributes: { name: 'Grace', home: { city: 'Arlington' } } },
              ],
            }),
            'roster.json',
          ),
        ),
      ).toBe(
        'the selected file is not a readable network: the "home" attribute of node 2 is not a value a variable can hold',
      );
    });
  });
});
