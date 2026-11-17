import { describe, expect, it } from 'vitest';

import {
  suppliedWordingIn,
  withSuppliedWording,
  withoutSuppliedWording,
} from '../../../__tests__/suppliedWording.ts';

// Swahili is a language Network Canvas has no wording in.
const localization = { defaultLocale: 'en', locales: ['en', 'de', 'sw'] };

const protocolWith = (
  extra: Readonly<{ stages?: readonly unknown[]; interfaceText?: unknown }>,
) => ({
  localization,
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
  ...extra,
});

const finish = (extra: Readonly<Record<string, unknown>> = {}) => ({
  id: 'finish',
  type: 'FinishSession',
  label: { en: 'Finish' },
  ...extra,
});

describe('a protocol with the wording it shows written out', () => {
  it('reads as stored once it is stored again, whatever wording is its own', () => {
    const stored = protocolWith({
      stages: [
        finish({ finishLabel: { en: 'All done', sw: 'Maliza' } }),
        { id: 'info', type: 'Information', label: { en: 'Welcome' } },
      ],
      interfaceText: { navigation: { back: { de: 'Vorherige Seite' } } },
    });

    const shown = withSuppliedWording(stored);

    expect(shown.stages[0]).toMatchObject({
      finishLabel: { en: 'All done', de: 'Beenden', sw: 'Maliza' },
      finishConfirmation: {
        en: 'Are you sure you want to finish the interview?',
      },
    });
    expect(shown.interfaceText).toMatchObject({
      navigation: { back: { en: 'Back', de: 'Vorherige Seite' } },
    });
    expect(withoutSuppliedWording(shown)).toEqual(stored);
  });

  it('is the same protocol when it is already stored', () => {
    const stored = protocolWith({
      stages: [finish({ finishLabel: { en: 'All done' } })],
    });

    expect(withoutSuppliedWording(stored)).toBe(stored);
  });
});

describe("Network Canvas's own wording for a text of a protocol", () => {
  const protocol = protocolWith({
    stages: [
      finish({ finishLabel: { en: 'All done', de: 'Fertig', sw: 'Maliza' } }),
    ],
    interfaceText: { navigation: { back: { en: 'Previous' } } },
  });
  const supplied = suppliedWordingIn(protocol);

  it('is given for a stage setting it words, in the languages it has wording in', () => {
    expect(supplied(['stages', 0, 'finishLabel'])).toEqual({
      en: 'Finish',
      de: 'Beenden',
    });
  });

  it('is given for an interface text the protocol shows, whatever the protocol holds for it', () => {
    expect(supplied(['interfaceText', 'navigation', 'back'])).toEqual({
      en: 'Back',
      de: 'Zurück',
    });
  });

  it('is not given for text Network Canvas does not word', () => {
    expect(supplied(['stages', 0, 'label'])).toBeUndefined();
    expect(supplied(['stages', 3, 'finishLabel'])).toBeUndefined();
    expect(
      supplied(['interfaceText', 'navigation', 'unknown']),
    ).toBeUndefined();
    expect(supplied(['name'])).toBeUndefined();
  });

  it('is not given in a protocol whose languages it has no wording in', () => {
    const swahili = suppliedWordingIn({
      ...protocol,
      localization: { defaultLocale: 'sw', locales: ['sw'] },
    });

    expect(swahili(['stages', 0, 'finishLabel'])).toBeUndefined();
    expect(swahili(['interfaceText', 'navigation', 'back'])).toBeUndefined();
  });
});
