import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';
import ParticipantLayout from '~/app/(interview)/layout';
import { frescoLocales } from '~/i18n/locales';
import { frescoCatalogs } from '~/src/locales/catalogs';

// The layout also exports its page metadata, which reads the request on the
// server; none of that runs when the layout renders.
vi.mock('~/i18n/server', () => ({ getServerIntl: vi.fn() }));
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
  it("shows the real interview layout in the host's language and declares no language of its own", () => {
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
    const button = screen.getByRole('button', { name: 'Continuar' });
    // The region inherits the document's language rather than asserting one:
    // the interview inside it (Shell) declares its own.
    const region = button.closest('[data-theme-interview]');
    expect(region).not.toBeNull();
    expect(region).not.toHaveAttribute('lang');
    expect(region).not.toHaveAttribute('dir');
    expect(document.documentElement).toHaveAttribute('lang', 'es');
  });
});
