import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import ComposerParametersField, {
  type ComposerParameters,
} from '../ComposerParametersField.tsx';

/**
 * A scale's end labels are rich-text editors, which ProseMirror cannot be
 * driven through in jsdom; a plain input carrying the same value keeps this
 * test about what the field writes, and the rich text field has its own test.
 */
vi.mock('../RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const ENGLISH_AND_SPANISH: ProtocolLocalization = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

/** What the codebook attribute's scale says at either end. */
const FROM_THE_ATTRIBUTE: ComposerParameters = {
  minLabel: { en: 'Never', es: 'Nunca' },
  maxLabel: { en: 'Always', es: 'Siempre' },
};

function renderScale(value: ComposerParameters) {
  const onChange = vi.fn();
  render(
    <ProtocolLocalizationProvider localization={ENGLISH_AND_SPANISH}>
      <ComposerParametersField
        shape="scalar"
        value={value}
        inherited={FROM_THE_ATTRIBUTE}
        inheritedFrom="contact frequency"
        onChange={onChange}
      />
    </ProtocolLocalizationProvider>,
  );
  return onChange;
}

const writeLowEnd = (text: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: /^Minimum label/ }), {
    target: { value: text },
  });

describe('ComposerParametersField', () => {
  it('goes back to following the attribute once every translation says what the attribute says', () => {
    const onChange = renderScale({
      minLabel: { en: 'Rarely', es: 'Nunca' },
      maxLabel: { en: 'Always', es: 'Siempre' },
    });

    writeLowEnd('Never');

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps settings of its own while another language still differs from the attribute', () => {
    const onChange = renderScale({
      minLabel: { en: 'Rarely', es: 'Raramente' },
      maxLabel: { en: 'Always', es: 'Siempre' },
    });

    writeLowEnd('Never');

    expect(onChange).toHaveBeenLastCalledWith({
      minLabel: { en: 'Never', es: 'Raramente' },
      maxLabel: { en: 'Always', es: 'Siempre' },
    });
  });
});
