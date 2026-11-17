import { configureStore, createAction, createReducer } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import { interfaceTextShownBy } from '@codaco/interview/supplied-wording';
import { createDefaultFinishSessionStage } from '@codaco/protocol-validation';

import DefaultLanguageTextAlert from '../DefaultLanguageTextAlert';
import { translationTableHref } from '../Localization/translationTableLinks';

const japanese = { defaultLocale: 'ja', locales: ['ja'] };

// The interview's shared words the protocol shows, written in Japanese as a
// researcher would write them: Network Canvas has no wording there.
const withJapaneseInterfaceText = <
  Protocol extends Parameters<typeof interfaceTextShownBy>[0],
>(
  protocol: Protocol,
) => {
  const interfaceText: Record<string, Record<string, { ja: string }>> = {};
  for (const { group, key } of interfaceTextShownBy(protocol)) {
    (interfaceText[group] ??= {})[key] = { ja: '日本語' };
  }
  return { ...protocol, interfaceText };
};

// As Architect creates a protocol in a language Network Canvas supplies no
// closing text for: the finish stage starts with none.
const newJapaneseProtocol = withJapaneseInterfaceText({
  name: 'Test protocol',
  schemaVersion: 9,
  localization: japanese,
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    createDefaultFinishSessionStage({ id: 'end', localization: japanese }),
  ],
});

// Network Canvas has no built-in wording in Japanese, so the researcher writes
// the finish stage's button and messages too.
const builtInWording = {
  finishLabel: { ja: '終了' },
  finishConfirmation: { ja: 'インタビューを終了しますか?' },
  finishFailed: { ja: 'インタビューを終了できませんでした。' },
};

// Every text is written, and the protocol names the fallback language its
// default language needs.
const written = {
  ...newJapaneseProtocol,
  localization: { ...japanese, fallbackLocale: 'en' },
  stages: [
    {
      ...newJapaneseProtocol.stages[0],
      content: { ja: '# 終わり\n\nご協力ありがとうございました。' },
      finishedContent: { ja: '# 終了しました' },
      ...builtInWording,
    },
  ],
};

const replaceProtocol = createAction<unknown>('test/replaceProtocol');

const createTestStore = (present: unknown) =>
  configureStore({
    reducer: {
      activeProtocol: createReducer({ present }, (builder) => {
        builder.addCase(replaceProtocol, (_state, action) => ({
          present: action.payload,
        }));
      }),
    },
  });

const renderAlert = (present: unknown) => {
  const store = createTestStore(present);
  const location = memoryLocation({ path: '/protocol', record: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <Router hook={location.hook}>{children}</Router>
    </Provider>
  );
  render(<DefaultLanguageTextAlert />, { wrapper });
  return { store, location };
};

const TITLE = 'This protocol can’t be downloaded yet';
const EDIT_LINK = { name: 'Edit the stage that ends the interview' };

describe('<DefaultLanguageTextAlert />', () => {
  it('explains that a new protocol without closing text cannot be downloaded', () => {
    renderAlert(newJapaneseProtocol);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        /^A stage that ends the interview has no text for its closing screen or its finished screen in Japanese\. The protocol can’t be downloaded until/,
      ),
    ).toBeInTheDocument();
  });

  it('opens the finish stage editor from its link', () => {
    const { location } = renderAlert(newJapaneseProtocol);

    const link = screen.getByRole('link', EDIT_LINK);
    expect(link).toHaveAttribute('href', '/protocol/stage/end');
    fireEvent.click(link);
    expect(location.history?.at(-1)).toBe('/protocol/stage/end');
  });

  it('renders nothing once the closing and finished text are written', () => {
    renderAlert(written);

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', EDIT_LINK)).not.toBeInTheDocument();
  });

  it('appears when a researcher clears the text later, naming only what is missing', () => {
    const { store } = renderAlert(written);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();

    act(() => {
      store.dispatch(
        replaceProtocol({
          ...written,
          stages: [{ ...written.stages[0], content: {} }],
        }),
      );
    });

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        'A stage that ends the interview has no text for its closing screen in Japanese. The protocol can’t be downloaded until it’s added.',
      ),
    ).toBeInTheDocument();
  });

  it('asks an automatic finish stage only for its finished text', () => {
    renderAlert({
      ...newJapaneseProtocol,
      stages: [{ ...newJapaneseProtocol.stages[0], mode: 'automatic' }],
    });

    expect(
      screen.getByText(
        'A stage that ends the interview has no text for its finished screen in Japanese. The protocol can’t be downloaded until it’s added.',
      ),
    ).toBeInTheDocument();
  });

  it('renders nothing for an automatic finish stage with its finished text', () => {
    renderAlert({
      ...newJapaneseProtocol,
      localization: written.localization,
      stages: [
        {
          ...newJapaneseProtocol.stages[0],
          mode: 'automatic',
          finishedContent: { ja: '# 終了しました' },
          ...builtInWording,
        },
      ],
    });

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('then explains that the built-in wording has none in the default language, and links to it', () => {
    const { location } = renderAlert({
      ...written,
      stages: [{ ...written.stages[0], finishLabel: {} }],
    });

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Network Canvas has no built-in wording, such as button labels and messages, in Japanese. Translate it into Japanese, or make a language that has built-in wording the default. The protocol can’t be downloaded until then.',
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'Show the wording to translate',
    });
    expect(link).toHaveAttribute(
      'href',
      translationTableHref({ kind: 'language', locale: 'ja' }),
    );
    fireEvent.click(link);
    expect(location.history?.at(-1)).toBe(
      translationTableHref({ kind: 'language', locale: 'ja' }),
    );
  });

  it('then asks for a fallback language once the text is written, and links to the Languages page', () => {
    const { location } = renderAlert({ ...written, localization: japanese });

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Network Canvas has no built-in wording in Japanese, so this protocol needs a fallback language. When an update adds text to the interview, participants see that text in the fallback language. Choose one on the Languages page. The protocol can’t be downloaded until then.',
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'Choose a fallback language',
    });
    expect(link).toHaveAttribute('href', '/protocol/localization');
    fireEvent.click(link);
    expect(location.history?.at(-1)).toBe('/protocol/localization');
  });

  it('reports missing text before the missing fallback language', () => {
    renderAlert(newJapaneseProtocol);

    expect(screen.getByRole('link', EDIT_LINK)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Choose a fallback language' }),
    ).not.toBeInTheDocument();
  });

  it('counts only the default language', () => {
    renderAlert({
      ...written,
      localization: { defaultLocale: 'ja', locales: ['ja', 'en'] },
      stages: [
        {
          ...written.stages[0],
          content: {
            en: '# All done\n\nThank you.',
            ja: '# 終わり\n\nありがとう。',
          },
          finishedContent: { en: 'This interview is finished.' },
        },
      ],
    });

    expect(
      screen.getByText(
        'A stage that ends the interview has no text for its finished screen in Japanese. The protocol can’t be downloaded until it’s added.',
      ),
    ).toBeInTheDocument();
  });
});
