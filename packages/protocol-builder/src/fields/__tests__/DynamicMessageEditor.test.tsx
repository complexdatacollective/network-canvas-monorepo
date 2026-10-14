import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LocaleTag } from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import { DynamicMessageEditor } from '../DynamicTextField.tsx';

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };
const LOCALE: LocaleTag = 'en';

describe('DynamicMessageEditor', () => {
  it('keeps text naming a value this place can no longer offer', async () => {
    // A translation cell: it cannot change the stage's bindings, and the one
    // value its text names is an attribute the codebook no longer has.
    const onMessageChange = vi.fn();
    render(
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <DynamicMessageEditor
          id="text"
          name="text"
          ariaLabelledBy={undefined}
          ariaDescribedBy=""
          ariaInvalid={false}
          ariaRequired={false}
          placeholder={undefined}
          autoFocus={false}
          disabled={false}
          readOnly={false}
          markdown={false}
          singleLine
          compact={false}
          message="Hello {gone}, welcome"
          onMessageChange={onMessageChange}
          original={undefined}
          locale={LOCALE}
          site={{
            context: { roles: new Set(['ego']), variablesFor: () => ({}) },
            bindings: { gone: { path: 'ego.deleted' } },
          }}
        />
      </ProtocolLocalizationProvider>,
    );

    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(editor).toHaveTextContent('Hello gone, welcome'),
    );
    expect(editor.querySelector('[data-token="gone"]')).toBeInTheDocument();
    expect(onMessageChange).not.toHaveBeenCalled();
  });
});
