import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import type { DynamicValueSiteState } from '../../localization/useDynamicValueSite.ts';
import ComposerParametersField, {
  type ComposerParameters,
} from '../ComposerParametersField.tsx';

/**
 * On a stage's form, a scale's end labels are a form field's captions and may
 * show values the interview fills in, which the stage editor around the field
 * works out from the stage. Mounted bare here, the field is given what a
 * caption with nothing bound can show, keeping this test about what the field
 * writes; which values a caption can show has its own tests.
 */
vi.mock('../../localization/useDynamicValueSite.ts', async (importActual) => {
  const actual =
    await importActual<
      typeof import('../../localization/useDynamicValueSite.ts')
    >();
  const site: DynamicValueSiteState = {
    context: {
      roles: new Set(['ego']),
      variablesFor: () => ({}),
      notYetWritten: undefined,
    },
    bindings: {},
    setBindings: () => undefined,
    namesInUse: () => new Set(),
  };
  return { ...actual, useDynamicValueSite: () => site };
});

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

/** Rewrites the low end's label in the editing language. */
const writeLowEnd = async (text: string) => {
  const user = userEvent.setup();
  const label = screen.getByRole('textbox', { name: /^Minimum label/ });
  await user.clear(label);
  await user.type(label, text);
};

describe('ComposerParametersField', () => {
  it('goes back to following the attribute once every translation says what the attribute says', async () => {
    const onChange = renderScale({
      minLabel: { en: 'Rarely', es: 'Nunca' },
      maxLabel: { en: 'Always', es: 'Siempre' },
    });

    await writeLowEnd('Never');

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps settings of its own while another language still differs from the attribute', async () => {
    const onChange = renderScale({
      minLabel: { en: 'Rarely', es: 'Raramente' },
      maxLabel: { en: 'Always', es: 'Siempre' },
    });

    await writeLowEnd('Never');

    expect(onChange).toHaveBeenLastCalledWith({
      minLabel: { en: 'Never', es: 'Raramente' },
      maxLabel: { en: 'Always', es: 'Siempre' },
    });
  });
});
