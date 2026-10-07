import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';
import {
  escapeMessageText,
  getLocaleMetadata,
  type LocalizedString,
} from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import {
  LocalizedInputField,
  LocalizedRichTextField,
} from '../LocalizedStringField.tsx';

const ENGLISH_AND_SPANISH: ProtocolLocalization = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

type Saved = { title?: LocalizedString };

function renderTitle({
  initialValue,
  localization = ENGLISH_AND_SPANISH,
  initialLocale,
  required = false,
}: {
  initialValue?: LocalizedString;
  localization?: ProtocolLocalization;
  initialLocale?: string;
  required?: boolean;
}) {
  const saved: { current: Saved | undefined } = { current: undefined };
  render(
    <ProtocolLocalizationProvider
      localization={localization}
      initialLocale={initialLocale}
    >
      <Form
        onSubmit={(values: Saved) => {
          saved.current = values;
          return { success: true };
        }}
      >
        <Field
          name="title"
          label="Title"
          component={LocalizedInputField}
          initialValue={initialValue}
          required={required}
        />
        <button type="submit">Save</button>
      </Form>
    </ProtocolLocalizationProvider>,
  );
  return saved;
}

async function chooseLanguage(name: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Editing language/ }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
}

describe('LocalizedStringField', () => {
  it('edits the default language first, as plain text in its own language', () => {
    renderTitle({ initialValue: { en: "Who's '{here}'?", es: 'Hola' } });

    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue("Who's {here}?");
    expect(input.closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(input.closest('[dir]')).toHaveAttribute('dir', 'ltr');
  });

  it('edits the initial language first when the protocol declares it', () => {
    renderTitle({
      initialValue: { en: 'Hello', es: 'Hola' },
      initialLocale: 'es',
    });

    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue('Hola');
    expect(input.closest('[lang]')).toHaveAttribute('lang', 'es');
  });

  it('edits the default language when the initial language is not declared', () => {
    renderTitle({
      initialValue: { en: 'Hello', es: 'Hola' },
      initialLocale: 'fr',
    });

    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue('Hello');
    expect(input.closest('[lang]')).toHaveAttribute('lang', 'en');
  });

  it('writes only the editing language, escaped, and keeps the others', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({ initialValue: { en: 'Hello', es: 'Hola' } });

    await chooseLanguage(/^español/);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue('Hola');
    expect(input.closest('[lang]')).toHaveAttribute('lang', 'es');

    await user.clear(input);
    // user-event reads `{{` as one literal brace.
    await user.type(input, 'Hola {{amigo}');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saved.current).toEqual({
        title: { en: 'Hello', es: escapeMessageText('Hola {amigo}') },
      }),
    );
  });

  it('removes a translation that is cleared rather than storing it empty', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({ initialValue: { en: 'Hello', es: 'Hola' } });

    await chooseLanguage(/^español/);
    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saved.current).toEqual({ title: { en: 'Hello' } }),
    );
  });

  it('leaves a required field unanswered once its last translation is cleared', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({
      initialValue: { en: 'Hello' },
      required: true,
    });

    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/You must answer this question/),
    ).toBeInTheDocument();
    expect(saved.current).toBeUndefined();
  });

  it('refuses a required field whose only translation is spaces', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({ required: true });

    await user.type(screen.getByRole('textbox', { name: 'Title' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/You must answer this question/),
    ).toBeInTheDocument();
    expect(saved.current).toBeUndefined();
  });

  it('marks the languages a string is missing without refusing it', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({ initialValue: { en: 'Hello' } });

    expect(screen.getByText('1 translation missing')).toBeInTheDocument();

    await chooseLanguage(/^español/);
    expect(
      screen.getByText(
        'Not translated into español yet. Participants using español will see the English text, unless their browser also lists a language that has it.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(saved.current).toEqual({ title: { en: 'Hello' } }),
    );
  });

  it('says a closely related translation is shown, whatever the browser lists', async () => {
    const mexican = getLocaleMetadata('es-MX').label;
    renderTitle({
      initialValue: { en: 'Hello', es: 'Hola' },
      localization: { defaultLocale: 'en', locales: ['en', 'es', 'es-MX'] },
    });

    await chooseLanguage(new RegExp(`^${mexican}`));
    expect(
      screen.getByText(
        `Not translated into ${mexican} yet. Participants using ${mexican} will see the español text.`,
      ),
    ).toBeInTheDocument();
  });

  it('lists the languages alphabetically by name', async () => {
    renderTitle({
      initialValue: { en: 'Hello' },
      localization: { defaultLocale: 'en', locales: ['fr', 'en', 'de'] },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Editing language/ }));
    const languages = await screen.findAllByRole('menuitemradio');

    expect(languages.map((item) => item.textContent)).toEqual([
      'DeutschMissing',
      'EnglishDefault',
      'françaisMissing',
    ]);
  });

  it('draws no language menu for a protocol written in one language', () => {
    renderTitle({
      initialValue: { und: 'Hello' },
      localization: { defaultLocale: 'und', locales: ['und'] },
    });

    expect(
      screen.queryByRole('button', { name: /Editing language/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Hello');
  });

  it('shares one editing language across every localized field', async () => {
    render(
      <ProtocolLocalizationProvider localization={ENGLISH_AND_SPANISH}>
        <Form onSubmit={() => ({ success: true })}>
          <Field
            name="title"
            label="Title"
            component={LocalizedInputField}
            initialValue={{ en: 'Hello', es: 'Hola' }}
          />
          <Field
            name="body"
            label="Body"
            component={LocalizedRichTextField}
            initialValue={{ en: 'Welcome', es: 'Bienvenido' }}
          />
        </Form>
      </ProtocolLocalizationProvider>,
    );

    const [titleMenu] = screen.getAllByRole('button', {
      name: /Editing language/,
    });
    if (titleMenu === undefined) throw new Error('No language menu');
    const user = userEvent.setup();
    await user.click(titleMenu);
    await user.click(
      await screen.findByRole('menuitemradio', { name: /^español/ }),
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Hola');
    const body = screen.getByRole('textbox', { name: 'Body' });
    await waitFor(() => expect(body).toHaveTextContent('Bienvenido'));
    expect(within(body.closest('[lang]') ?? body).queryByText('Welcome')).toBe(
      null,
    );
  });
});
