import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';
import ParticipantLayout from '~/app/(interview)/layout';
import { frescoLocales } from '~/i18n/locales';
import { frescoCatalogs } from '~/src/locales/catalogs';

vi.mock('~/app/(interview)/_components/EndSessionRecording', () => ({
  default: () => null,
}));

function ParticipantContent() {
  const intl = useAppIntl();
  return (
    <button type="button">{intl.formatMessage(commonMessages.continue)}</button>
  );
}

describe('Fresco participant locale boundary', () => {
  it('keeps the real interview layout on its independent default inside a Spanish researcher host', () => {
    render(
      <AppI18nProvider
        locale="es"
        locales={frescoLocales}
        messages={frescoCatalogs.es}
      >
        <ParticipantLayout>
          <ParticipantContent />
        </ParticipantLayout>
      </AppI18nProvider>,
    );
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(button.closest('[dir]')).toHaveAttribute('dir', 'ltr');
    expect(document.documentElement).toHaveAttribute('lang', 'es');
  });
});
