import { describe, expect, it } from 'vitest';

import {
  isProtocolObjectId,
  validateProtocol,
} from '@codaco/protocol-validation';

import { createEmptyProtocol } from '../emptyProtocol.ts';

describe('a new protocol', () => {
  it('is in English, with the finish stage Network Canvas supplies, unless told otherwise', async () => {
    const protocol = createEmptyProtocol({ name: 'New study' });

    expect(protocol).toEqual({
      name: 'New study',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      stages: [
        expect.objectContaining({
          id: expect.toSatisfy(isProtocolObjectId),
          type: 'FinishSession',
          finishedContent: {
            en: '# Interview Finished\n\nThank you for participating!',
          },
        }),
      ],
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: {},
    });
    const validated = await validateProtocol(protocol);
    expect(
      validated.success,
      JSON.stringify(validated.error?.issues ?? [], null, 2),
    ).toBe(true);
  });

  it('holds the description and languages it is given', () => {
    const localization = { defaultLocale: 'fr', locales: ['fr', 'en'] };
    const protocol = createEmptyProtocol({
      name: 'Étude',
      description: 'Une étude',
      localization,
    });

    expect(protocol).toMatchObject({ description: 'Une étude', localization });
    expect(protocol.stages).toEqual([
      expect.objectContaining({
        finishedContent: {
          fr: '# Entretien terminé\n\nMerci de votre participation\u00a0!',
          en: '# Interview Finished\n\nThank you for participating!',
        },
      }),
    ]);
  });

  it('gives each new protocol its own finish stage id', () => {
    expect(createEmptyProtocol({ name: 'One' }).stages[0]?.id).not.toBe(
      createEmptyProtocol({ name: 'Two' }).stages[0]?.id,
    );
  });
});
