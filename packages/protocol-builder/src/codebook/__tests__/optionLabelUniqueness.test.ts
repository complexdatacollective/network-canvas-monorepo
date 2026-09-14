import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { readMessage } from '../../testing/i18n.ts';
import {
  documentWithUpdatedVariable,
  InvalidCodebookDraftError,
} from '../editing.ts';

const SUBJECT = { entity: 'node', type: 'person' } as const;

const personDocument = (options: readonly unknown[]): SectionDoc => ({
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {
    closeness: { name: 'closeness', type: 'ordinal', options },
  },
});

const SOUND: readonly unknown[] = [
  { label: 'Close', value: 'close' },
  { label: 'Distant', value: 'distant' },
];

/**
 * The write's own answer to a list of options, as the researcher would read
 * it — or `undefined` where it accepted the list.
 *
 * Every surface that authors an option label ends up here: the codebook
 * editor's own save, and the row saves that write the attribute under their
 * section's lock (`useSetVariableOptions`). So this is where a refusal the
 * editors already showed has to be made again, and where a caller writing
 * straight to the codebook meets it for the first time.
 */
const refusal = (options: readonly unknown[]): string | undefined => {
  try {
    documentWithUpdatedVariable({
      subject: SUBJECT,
      authoritativeDocument: personDocument(SOUND),
      variableId: 'closeness',
      draft: { options },
      replaceProperties: ['options'],
    });
    return undefined;
  } catch (error: unknown) {
    if (!(error instanceof InvalidCodebookDraftError)) throw error;
    const message = error.issues[0]?.message;
    // Encoded as it crosses the error, and read back the way the surface that
    // renders it reads it.
    return message === undefined ? undefined : readMessage(message);
  }
};

const DUPLICATE = 'Every option needs a unique label.';

/**
 * One label written the two ways Unicode allows: `é` as the single
 * precomposed character, and `e` followed by a combining acute accent.
 *
 * Written as escapes rather than as accented characters, so an editor or a
 * formatter that normalises this file cannot quietly turn the pair into two
 * copies of the same string and leave the test asserting nothing.
 */
const PRECOMPOSED = 'Tr\u00e9s proche';
const DECOMPOSED = 'Tre\u0301s proche';

describe('the write that records the answers an attribute offers', () => {
  it('accepts two labels a participant can tell apart', () => {
    expect(refusal(SOUND)).toBeUndefined();
  });

  it('refuses two labels differing only in case', () => {
    expect(
      refusal([
        { label: 'Close', value: 'close' },
        { label: 'close', value: 'nearby' },
      ]),
    ).toBe(DUPLICATE);
  });

  it('refuses two labels differing only in how the accent is composed', () => {
    // The same two words on screen, written the two ways different keyboards,
    // input methods and paste sources produce — which is why the labels are
    // stored canonically in the first place, and why a list that arrived from
    // somewhere else is still compared canonically here.
    //
    // Spelled out and asserted, because a pair of labels typed identically
    // into this file would refuse for being the same STRING and the test would
    // go on passing with the canonical comparison taken out.
    expect(PRECOMPOSED).not.toBe(DECOMPOSED);
    expect(PRECOMPOSED.normalize('NFC')).toBe(DECOMPOSED.normalize('NFC'));

    expect(
      refusal([
        { label: PRECOMPOSED, value: 'very' },
        { label: DECOMPOSED, value: 'close' },
      ]),
    ).toBe(DUPLICATE);
  });

  it('says what is missing before it says two labels read the same', () => {
    // Two blank labels are an unfinished list, not two choices nothing
    // distinguishes — and telling the researcher both about one edit would
    // send them looking for a clash that is not there.
    expect(
      refusal([
        { label: '   ', value: 'close' },
        { label: '', value: 'distant' },
      ]),
    ).toBe('Every option needs both a label and a value.');
  });
});
