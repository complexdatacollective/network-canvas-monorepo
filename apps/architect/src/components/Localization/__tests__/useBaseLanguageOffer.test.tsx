import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useBaseLanguageOffer } from '../useBaseLanguageOffer';

const confirmMock = globalThis.__architectDialogMocks.confirm;

type Question = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

const questions = () =>
  confirmMock.mock.calls.map(([question]) => question as Question);

const offer = () => renderHook(() => useBaseLanguageOffer()).result.current;

/**
 * Network Canvas writes its built-in wording only in a language it has it in
 * exactly. A researcher adding a regional variant of one (Mexican Spanish) is
 * asked whether to add that language too, so the interview can show its
 * wording wherever the variant has none of its own.
 */
describe('the offer to also add a regional variant’s language', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
  });

  it('asks to add Spanish beside Mexican Spanish, and adds it when accepted', async () => {
    await expect(offer()(['es-MX'], ['en'])).resolves.toEqual(['es']);
    expect(questions()).toEqual([
      expect.objectContaining({
        title: 'Also add Spanish?',
        description:
          'Network Canvas has built-in wording, such as button labels and the closing screen, in Spanish but not in Mexican Spanish. If you also add Spanish, participants using Mexican Spanish see the Spanish wording wherever you haven’t written your own.',
        confirmLabel: 'Add Spanish',
        cancelLabel: 'Don’t add Spanish',
      }),
    ]);
  });

  it('adds nothing when the researcher declines', async () => {
    confirmMock.mockResolvedValue(false);
    await expect(offer()(['es-MX'], ['en'])).resolves.toEqual([]);
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('explains what the default language still needs when the variant is the default', async () => {
    await offer()(['es-MX'], [], 'es-MX');
    expect(questions()[0]?.description).toMatch(
      /Because Mexican Spanish is the default language, the protocol can’t be downloaded until its built-in wording is translated into Mexican Spanish, or Spanish is made the default\.$/,
    );
  });

  it('does not ask when the protocol already has the language, or for one Network Canvas has wording in', async () => {
    await expect(offer()(['es-MX'], ['en', 'es'])).resolves.toEqual([]);
    await expect(offer()(['es-MX', 'es'], ['en'])).resolves.toEqual([]);
    await expect(offer()(['fr', 'de'], ['en'])).resolves.toEqual([]);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('asks once for two variants of the same language', async () => {
    await expect(offer()(['es-MX', 'es-AR'], ['en'])).resolves.toEqual(['es']);
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('never offers a language that is merely close, nor one with no built-in base', async () => {
    await expect(offer()(['gl', 'ja', 'sw'], ['en'])).resolves.toEqual([]);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('offers the script Network Canvas has wording in for a Chinese region', async () => {
    await expect(offer()(['zh-TW'], ['en'])).resolves.toEqual(['zh-Hant']);
  });
});
