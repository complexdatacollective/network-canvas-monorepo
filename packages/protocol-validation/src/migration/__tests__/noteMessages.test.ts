import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { protocolValidationCatalogs } from '../../locales/catalogs.ts';
import { formatMigrationNotes } from '../../messages.ts';
import { getMigrationInfo } from '../migrate-protocol.ts';

const en = createAppIntl({ locale: 'en' });
const es = createAppIntl({
  locale: 'es',
  messages: protocolValidationCatalogs.es,
});
const notes = getMigrationInfo(4, 8).notes;

describe('localized migration approval notes', () => {
  it('covers every current note-bearing migration in its original order', () => {
    expect(notes.map(({ version }) => version)).toEqual([5, 6, 7, 8]);
  });

  it.each(notes)(
    'retains exact English and translates every schema $version bullet',
    (note) => {
      expect(formatMigrationNotes(note.version, note.notes, en)).toBe(
        note.notes,
      );
      const translated = formatMigrationNotes(note.version, note.notes, es);
      expect(translated).not.toBe(note.notes);
      expect(translated.match(/^- /gm)?.length).toBe(
        note.notes.match(/^- /gm)?.length,
      );
      for (const [token] of note.notes.matchAll(/`[^`]+`/g)) {
        expect(translated).toContain(token);
      }
    },
  );

  it('retains literal English defaults and code braces instead of treating them as ICU values', () => {
    const latest = notes.find(({ version }) => version === 8);
    if (!latest) throw new Error('Expected current migration notes');
    const translated = formatMigrationNotes(latest.version, latest.notes, es);
    for (const value of [
      'Stage 3',
      'Information',
      'Add {node type name}',
      'Add Person',
      'Please specify',
      'Other',
      '`{ enabled }`',
      'Yes/No',
    ]) {
      expect(translated).toContain(value);
    }
    expect(translated).toContain(
      'Solo se conserva el primer campo de cada atributo.',
    );
  });

  it('preserves unknown-version notes as provided', () => {
    expect(
      formatMigrationNotes(99, 'Future publisher-supplied note.', es),
    ).toBe('Future publisher-supplied note.');
  });
});
