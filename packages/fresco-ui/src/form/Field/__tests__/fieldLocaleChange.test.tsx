import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import InputField from '../../fields/InputField';
import FormStoreProvider from '../../store/formStoreProvider';
import Field from '../Field';

const REQUIRED_EN = 'You must answer this question before continuing.';
const REQUIRED_TRANSLATED = 'You must answer this question before carrying on.';

// en-GB does not really override the required message — the whole point of an
// override catalog is that it is sparse. It stands in here for any locale that
// does translate it, so an assertion can tell a re-formatted error apart from
// one left over from the previous language.
const CATALOGS: Readonly<Record<string, Record<string, string>>> = {
  'en': {},
  'en-GB': { 'frescoUi.validation.required': REQUIRED_TRANSLATED },
};

function LocaleHarness() {
  const [locale, setLocale] = useState('en');

  return (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={CATALOGS[locale]}
      manageDocument={false}
    >
      <FormStoreProvider>
        <Field name="name" label="Name" component={InputField} required />
      </FormStoreProvider>
      <button type="button" onClick={() => setLocale('en-GB')}>
        switch language
      </button>
    </AppI18nProvider>
  );
}

/** Leave the field dirty, blurred and empty, so its error is on screen. */
async function showTheRequiredError(): Promise<HTMLInputElement> {
  const { container } = render(<LocaleHarness />);

  const input = container.querySelector('input[name="name"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('name input not rendered');
  }
  fireEvent.change(input, { target: { value: 'x' } });
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input, {
    relatedTarget: screen.getByRole('button', { name: 'switch language' }),
  });

  const error = await screen.findByTestId('name-field-error');
  expect(error).toHaveTextContent(REQUIRED_EN);
  expect(input).toHaveAttribute('aria-invalid', 'true');
  return input;
}

function switchLanguage() {
  fireEvent.click(screen.getByRole('button', { name: 'switch language' }));
}

describe('a field whose form is open when the locale changes', () => {
  it('is still reported invalid once the switch settles', async () => {
    const input = await showTheRequiredError();

    switchLanguage();

    // The formatter's identity changes with the locale, so anything that
    // rebuilds the field's registration from it unregisters the field — and
    // unregistering deletes its stored errors along with the blurred flag
    // that lets them show. The person is left with a form that is still
    // invalid and nothing, on screen or in the accessibility tree, saying so.
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
  });

  it('re-renders that error in the new language', async () => {
    await showTheRequiredError();

    switchLanguage();

    // A stored error is a plain string, formatted when validation last ran,
    // so nothing puts it into the new language without re-running validation.
    await waitFor(() =>
      expect(screen.getByTestId('name-field-error')).toHaveTextContent(
        REQUIRED_TRANSLATED,
      ),
    );
  });
});

describe('a field being validated at the moment the locale changes', () => {
  it('does not keep the old language once the in-flight result lands', async () => {
    // The switch can land between a validation starting and its result
    // committing. While it is in flight there is no error on screen, so
    // nothing to re-run — and if that counted as "this locale has been dealt
    // with", the result arriving a moment later stayed in the old language
    // with no further trigger to correct it.
    //
    // Blur and the language switch are dispatched in the same tick, so the
    // validation is outstanding when the locale changes. The assertion waits
    // for the settled state and touches nothing else: any further interaction
    // would revalidate and paper over the defect.
    const { container } = render(<LocaleHarness />);
    const input = container.querySelector('input[name="name"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('name input not rendered');
    }

    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', { name: 'switch language' }),
    });
    switchLanguage();

    await waitFor(() => {
      expect(screen.getByTestId('name-field-error')).toHaveTextContent(
        REQUIRED_TRANSLATED,
      );
    });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
