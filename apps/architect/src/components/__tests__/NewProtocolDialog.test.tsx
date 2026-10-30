import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import {
  AppIntlOverlay,
  type AppMessageOverride,
} from '@codaco/app-i18n/react';
import {
  PROTOCOL_NAME_MAX_LENGTH,
  PROTOCOL_NAME_TOO_LONG_MESSAGE as protocolNameTooLongDescriptor,
} from '~/config';

import NewProtocolDialog from '../NewProtocolDialog';

// 1 grapheme, 8 UTF-16 code units. fresco-ui's built-in `maxLength` validator
// measures `value.length`, so a cap wired to it would reject 13 of these while
// the editor's own control accepts 100 — a name a researcher could rename INTO
// but never create. These tests pin the two surfaces to one unit.
const FAMILY = '🧑‍🤝‍🧑';

const renderDialog = () => {
  const onSubmit = vi.fn();
  render(<NewProtocolDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
  return onSubmit;
};

const nameInput = () =>
  screen.getByRole('textbox', { name: /Protocol Name/i }) as HTMLInputElement;

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Create Protocol' }));

describe('NewProtocolDialog', () => {
  it('states the limit before an error can happen', () => {
    renderDialog();
    expect(
      screen.getByText(
        `Use a short, recognizable name of up to ${PROTOCOL_NAME_MAX_LENGTH} characters. Include a version number or date when it helps distinguish drafts, but avoid long project notes.`,
      ),
    ).toBeInTheDocument();
  });

  it('lets an RTL name set its own base direction', () => {
    renderDialog();
    // `Field` strips validation props but forwards everything else to the
    // control, so this reaches the real <input>.
    expect(nameInput()).toHaveAttribute('dir', 'auto');
  });

  it('blocks creation of an over-limit name and explains why', async () => {
    const onSubmit = renderDialog();

    fireEvent.change(nameInput(), {
      target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH + 1) },
    });
    submit();

    expect(
      await screen.findByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('leaves an over-limit paste intact instead of truncating it', async () => {
    renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'B'.repeat(300) } });
    submit();

    // A soft cap, because this surface has a submit gate: the researcher's
    // clipboard content stays on screen to be edited down, and nothing has been
    // silently cut to 100 behind their back.
    expect(
      await screen.findByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).toBeVisible();
    expect(nameInput()).toHaveValue('B'.repeat(300));
  });

  it('accepts a name at the limit', async () => {
    const onSubmit = renderDialog();

    fireEvent.change(nameInput(), {
      target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH) },
    });
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH),
      }),
    );
  });

  it('counts emoji the way the editor does, so a name it accepts can be created', async () => {
    const onSubmit = renderDialog();
    const atLimit = FAMILY.repeat(PROTOCOL_NAME_MAX_LENGTH);
    // 800 UTF-16 code units for 100 user-perceived characters. A cap wired to
    // fresco-ui's built-in `maxLength` would refuse this at the 13th emoji.
    expect(atLimit.length).toBe(PROTOCOL_NAME_MAX_LENGTH * 8);

    fireEvent.change(nameInput(), { target: { value: atLimit } });
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: atLimit }),
    );
    expect(
      screen.queryByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).not.toBeInTheDocument();

    // The other half of the same claim, and the half that gives this test
    // teeth: acceptance alone also holds when there is no cap at all, so the
    // 101st emoji has to be refused for "counts in graphemes" to mean anything.
    fireEvent.change(nameInput(), { target: { value: atLimit + FAMILY } });
    submit();

    expect(
      await screen.findByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('still requires a name', async () => {
    const onSubmit = renderDialog();
    submit();

    expect(
      await screen.findByText('Protocol name is required'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains an over-limit name in the language shown when it is checked', async () => {
    // The dialog stays open across a change of language; the explanation
    // follows it rather than the language the dialog was opened in.
    const english: AppMessageOverride = () => undefined;
    const renamed: AppMessageOverride = (message) =>
      message.id === protocolNameTooLongDescriptor.id
        ? 'Name too long, in the new language'
        : undefined;
    const dialog = (override: AppMessageOverride) => (
      <AppIntlOverlay override={override}>
        <NewProtocolDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} />
      </AppIntlOverlay>
    );
    const { rerender } = render(dialog(english));
    rerender(dialog(renamed));

    fireEvent.change(nameInput(), {
      target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH + 1) },
    });
    submit();

    expect(
      await screen.findByText('Name too long, in the new language'),
    ).toBeInTheDocument();
  });
});

describe('NewProtocolDialog protocol languages', () => {
  const renderWithLanguages = () => {
    const onSubmit = vi.fn();
    render(
      <NewProtocolDialog
        open
        onOpenChange={vi.fn()}
        chooseLanguages
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  };

  const languageList = () =>
    screen.getByRole('combobox', { name: 'Protocol languages' });
  const defaultSelect = () =>
    screen.queryByRole('combobox', { name: 'Default language' });

  // Each option is named "<name> (<tag>)", then the language's own name.
  // Scoped to the list, because the default-language select has options too.
  const toggleLanguages = async (user: UserEvent, tags: readonly string[]) => {
    await user.click(languageList());
    const list = await screen.findByRole('listbox');
    for (const tag of tags) {
      await user.click(
        within(list).getByRole('option', { name: new RegExp(`\\(${tag}\\)`) }),
      );
    }
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    );
  };

  it('starts on the language that best matches Architect’s own, and names it', () => {
    renderWithLanguages();

    expect(languageList()).toHaveTextContent('English');
  });

  it('asks for no default language while one language is chosen', () => {
    renderWithLanguages();

    expect(defaultSelect()).not.toBeInTheDocument();
  });

  it('creates a one-language protocol with that language as its default', async () => {
    const onSubmit = renderWithLanguages();

    fireEvent.change(nameInput(), { target: { value: 'Étude' } });
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Étude',
        localization: { defaultLocale: 'en', locales: ['en'] },
      }),
    );
  });

  it('asks for the default among several languages, starting on Architect’s own', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWithLanguages();

    fireEvent.change(nameInput(), { target: { value: 'Étude' } });
    await toggleLanguages(user, ['fr-CA']);

    const select = await screen.findByRole('combobox', {
      name: 'Default language',
    });
    expect(select).toHaveValue('en');
    // Alphabetical by name: Canadian French before English.
    expect(
      [...select.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['fr-CA', 'en']);

    fireEvent.change(select, { target: { value: 'fr-CA' } });
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Étude',
        localization: { defaultLocale: 'fr-CA', locales: ['en', 'fr-CA'] },
      }),
    );
  });

  it('never keeps a default that is no longer one of the chosen languages', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWithLanguages();

    fireEvent.change(nameInput(), { target: { value: 'Étude' } });
    await toggleLanguages(user, ['fr-CA']);
    fireEvent.change(
      await screen.findByRole('combobox', { name: 'Default language' }),
      { target: { value: 'fr-CA' } },
    );
    await toggleLanguages(user, ['fr-CA', 'de']);

    await waitFor(() => expect(defaultSelect()).toHaveValue('en'));
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Étude',
        localization: { defaultLocale: 'en', locales: ['en', 'de'] },
      }),
    );
  });

  it('defaults to the first chosen language when Architect’s own is not chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWithLanguages();

    fireEvent.change(nameInput(), { target: { value: 'Étude' } });
    await toggleLanguages(user, ['en', 'fr', 'de']);

    await waitFor(() => expect(defaultSelect()).toHaveValue('fr'));
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Étude',
        localization: { defaultLocale: 'fr', locales: ['fr', 'de'] },
      }),
    );
  });

  it('requires at least one language', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWithLanguages();

    fireEvent.change(nameInput(), { target: { value: 'Étude' } });
    await toggleLanguages(user, ['en']);
    submit();

    expect(
      await screen.findByText('Choose at least one language.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

/**
 * A template's name is a proposal: it is replaced by the first thing the
 * researcher types, whether they type straight away or click into it first.
 */
describe('NewProtocolDialog naming a template', () => {
  const TEMPLATE_NAME = 'Transnational Networks';

  const renderTemplateDialog = () => {
    const onSubmit = vi.fn();
    render(
      <NewProtocolDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        initialName={TEMPLATE_NAME}
      />,
    );
    return onSubmit;
  };

  it('opens with the template name selected', async () => {
    renderTemplateDialog();

    await waitFor(() => expect(nameInput()).toHaveFocus());
    expect(nameInput().selectionStart).toBe(0);
    expect(nameInput().selectionEnd).toBe(TEMPLATE_NAME.length);
  });

  it('replaces the name when the researcher clicks into it before typing', async () => {
    const user = userEvent.setup();
    const onSubmit = renderTemplateDialog();
    await waitFor(() => expect(nameInput()).toHaveFocus());

    await user.pointer({
      keys: '[MouseLeft]',
      target: nameInput(),
      offset: 7,
    });
    await user.keyboard('My study');
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'My study' }),
    );
  });

  it('places the caret on a later click', async () => {
    const user = userEvent.setup();
    renderTemplateDialog();
    await waitFor(() => expect(nameInput()).toHaveFocus());

    await user.pointer({ keys: '[MouseLeft]', target: nameInput(), offset: 7 });
    await user.pointer({ keys: '[MouseLeft]', target: nameInput(), offset: 7 });

    expect(nameInput().selectionStart).toBe(7);
    expect(nameInput().selectionEnd).toBe(7);
  });

  it('places the caret in a name the researcher typed, even when it is all selected', async () => {
    const user = userEvent.setup();
    renderTemplateDialog();
    await waitFor(() => expect(nameInput()).toHaveFocus());

    await user.keyboard('My study');
    nameInput().select();
    await user.pointer({ keys: '[MouseLeft]', target: nameInput(), offset: 3 });

    expect(nameInput().selectionStart).toBe(3);
    expect(nameInput().selectionEnd).toBe(3);
  });

  it('selects nothing in a blank protocol’s empty name', async () => {
    renderDialog();

    await waitFor(() => expect(nameInput()).toHaveFocus());
    await userEvent.setup().keyboard('Study');

    expect(nameInput()).toHaveValue('Study');
  });
});

const PROTOCOL_NAME_TOO_LONG_MESSAGE = createAppIntl({
  locale: 'en',
}).formatMessage(protocolNameTooLongDescriptor, {
  max: PROTOCOL_NAME_MAX_LENGTH,
});
