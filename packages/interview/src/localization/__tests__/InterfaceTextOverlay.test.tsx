import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import { formMessages } from '@codaco/fresco-ui/form/hooks/useForm';
import { messages as validationMessages } from '@codaco/fresco-ui/form/validation/functions';
import { getLocaleMetadata } from '@codaco/protocol-validation';

import { interfaceTextMessages } from '../../i18n/interfaceTextMessages';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { InterfaceTextOverlay } from '../InterfaceTextOverlay';
import { ProtocolLocalizationProvider } from '../ProtocolLocalizationProvider';

const localization = { defaultLocale: 'en', locales: ['en', 'es'] };

afterEach(() => {
  document.body.innerHTML = '';
});

function Interview({
  interfaceText,
  declared = localization,
  requestedLocales = ['es'],
  children,
}: {
  interfaceText: Parameters<typeof InterfaceTextOverlay>[0]['interfaceText'];
  declared?: Readonly<{ defaultLocale: string; locales: string[] }>;
  requestedLocales?: readonly string[];
  children: ReactNode;
}) {
  return (
    <InterviewI18nProvider>
      <ProtocolLocalizationProvider
        localization={declared}
        localeOptions={declared.locales.map((locale) =>
          getLocaleMetadata(locale),
        )}
        requestedLocales={requestedLocales}
        localePreference={null}
        onLocalePreferenceChange={vi.fn()}
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
          navigation: { back: { en: 'Previous', es: 'Anterior' } },
        }}
      >
        <Buttons />
      </Interview>,
    );

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDefined();
  });

  it('shows Network Canvas’s wording for a message the protocol holds no text for', () => {
    render(
      <Interview
        interfaceText={{
          navigation: { back: { en: 'Previous', es: 'Anterior' } },
        }}
      >
        <Buttons />
      </Interview>,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Anterior', 'Continuar']);
  });

  it('shows Network Canvas’s wording throughout for a protocol that holds none', () => {
    render(
      <Interview interfaceText={undefined}>
        <Buttons />
      </Interview>,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Volver', 'Continuar']);
  });

  // The protocol's Spanish does not stand in for the English it lacks: each
  // language is the protocol's where it holds it and Network Canvas's where
  // it does not.
  it('shows Network Canvas’s wording in a language the protocol’s text lacks', () => {
    render(
      <Interview
        interfaceText={{ navigation: { back: { es: 'Anterior' } } }}
        requestedLocales={['en']}
      >
        <Buttons />
      </Interview>,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Back', 'Continue']);
  });

  // Network Canvas has no Swahili: the protocol's own words are shown where
  // it holds them, and a message with no words at all keeps its catalog's.
  it('shows only the protocol’s wording in a language Network Canvas has none in', () => {
    const swahili = { defaultLocale: 'sw', locales: ['sw'] };

    render(
      <Interview
        interfaceText={{ navigation: { back: { sw: 'Rudi' } } }}
        declared={swahili}
        requestedLocales={['sw']}
      >
        <Buttons />
      </Interview>,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Rudi', 'Continue']);
  });

  // One wording serves every catalog message it stands in for.
  it('shows one text wherever any message it stands in for is asked for', () => {
    function Words() {
      const intl = useAppIntl();
      return (
        <ul>
          <li>{intl.formatMessage(commonMessages.genericError)}</li>
          <li>{intl.formatMessage(formMessages.submitFailed)}</li>
          <li>{intl.formatMessage(interfaceTextMessages['buttons.yes'])}</li>
        </ul>
      );
    }

    render(
      <Interview
        interfaceText={{
          messages: { error: { en: 'Oops', es: 'Vaya' } },
          buttons: { yes: { en: 'Yes', es: 'Vale' } },
        }}
      >
        <Words />
      </Interview>,
    );

    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Vaya', 'Vaya', 'Vale']);
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
