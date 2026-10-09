import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import { messages as validationMessages } from '@codaco/fresco-ui/form/validation/functions';
import { getLocaleMetadata } from '@codaco/protocol-validation';

import { interviewCatalogSource } from '../../i18n/catalog';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { InterfaceTextOverlay } from '../InterfaceTextOverlay';
import { ProtocolLocalizationProvider } from '../ProtocolLocalizationProvider';

const localization = { defaultLocale: 'en', locales: ['en', 'es'] };

beforeAll(() => interviewCatalogSource.load('es'));

afterEach(() => {
  document.body.innerHTML = '';
});

function Interview({
  interfaceText,
  children,
}: {
  interfaceText: Parameters<typeof InterfaceTextOverlay>[0]['interfaceText'];
  children: ReactNode;
}) {
  return (
    <InterviewI18nProvider requestedLocale={['es']}>
      <ProtocolLocalizationProvider
        localization={localization}
        localeOptions={localization.locales.map((locale) =>
          getLocaleMetadata(locale),
        )}
        requestedLocales={['es']}
        localePreference={null}
        recordedLocale={null}
        onLocalePreferenceChange={vi.fn()}
        onLocaleRecorded={vi.fn()}
      >
        <InterfaceTextOverlay interfaceText={interfaceText}>
          {children}
        </InterfaceTextOverlay>
      </ProtocolLocalizationProvider>
    </InterviewI18nProvider>
  );
}

function Buttons() {
  const intl = useAppIntl();
  return (
    <>
      <button type="button">{intl.formatMessage(commonMessages.back)}</button>
      <button type="button">
        {intl.formatMessage(commonMessages.continue)}
      </button>
    </>
  );
}

describe('InterfaceTextOverlay', () => {
  it('shows the protocol’s wording in the interview’s language', () => {
    render(
      <Interview
        interfaceText={{
          interview: { back: { en: 'Previous', es: 'Anterior' } },
        }}
      >
        <Buttons />
      </Interview>,
    );

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDefined();
  });

  it('leaves a message the protocol holds no text for to the catalog', () => {
    render(
      <Interview interfaceText={undefined}>
        <Buttons />
      </Interview>,
    );
    const catalogWording = screen
      .getAllByRole('button')
      .map((button) => button.textContent);
    document.body.innerHTML = '';

    render(
      <Interview
        interfaceText={{
          interview: { back: { en: 'Previous', es: 'Anterior' } },
        }}
      >
        <Buttons />
      </Interview>,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Anterior', catalogWording[1]]);
    expect(catalogWording[0]).not.toBe('Anterior');
  });

  // A comparison rule's message chooses its sentence by whether the other
  // question has a label, which the form gives as a yes-or-no.
  it('chooses the protocol’s sentence by a yes-or-no the message is given', () => {
    function Comparison({ label }: { label?: string }) {
      const intl = useAppIntl();
      return (
        <p>
          {intl.formatMessage(validationMessages.greaterThanError, {
            hasLabel: label !== undefined,
            label: label ?? '',
          })}
        </p>
      );
    }
    const greaterThan = {
      en: "{hasLabel, select, true {More than ''{label}''.} other {More than before.}}",
      es: "{hasLabel, select, true {Más que ''{label}''.} other {Más que antes.}}",
    };

    render(
      <Interview interfaceText={{ validation: { greaterThan } }}>
        <Comparison label="Edad" />
        <Comparison />
      </Interview>,
    );

    expect(screen.getByText("Más que 'Edad'.")).toBeDefined();
    expect(screen.getByText('Más que antes.')).toBeDefined();
  });
});
