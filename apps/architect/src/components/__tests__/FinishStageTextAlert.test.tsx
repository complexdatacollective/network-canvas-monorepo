import { configureStore, createAction, createReducer } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import { createDefaultFinishSessionStage } from '@codaco/protocol-validation';

import FinishStageTextAlert from '../FinishStageTextAlert';

const japanese = { defaultLocale: 'ja', locales: ['ja'] };

// As Architect creates a protocol in a language Network Canvas supplies no
// closing text for: the finish stage starts with none.
const newJapaneseProtocol = {
  name: 'Test protocol',
  schemaVersion: 9,
  localization: japanese,
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    createDefaultFinishSessionStage({ id: 'end', localization: japanese }),
  ],
};

const written = {
  ...newJapaneseProtocol,
  stages: [
    {
      ...newJapaneseProtocol.stages[0],
      title: { ja: '終わり' },
      content: { ja: 'ご協力ありがとうございました。' },
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
  render(<FinishStageTextAlert />, { wrapper });
  return { store, location };
};

const TITLE = 'This protocol can’t be downloaded yet';
const EDIT_LINK = { name: 'Edit the stage that ends the interview' };

describe('<FinishStageTextAlert />', () => {
  it('explains that a new protocol without closing text cannot be downloaded', () => {
    renderAlert(newJapaneseProtocol);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        'The stage that ends the interview has no heading or text in Japanese. The protocol can’t be downloaded until they’re added.',
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

  it('renders nothing once the heading and text are written', () => {
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
        'The stage that ends the interview has no text in Japanese. The protocol can’t be downloaded until it’s added.',
      ),
    ).toBeInTheDocument();
  });

  it('counts only the default language', () => {
    renderAlert({
      ...written,
      localization: { defaultLocale: 'ja', locales: ['ja', 'en'] },
      stages: [
        {
          ...written.stages[0],
          title: { en: 'All done' },
          content: { en: 'Thank you.', ja: 'ありがとう。' },
        },
      ],
    });

    expect(
      screen.getByText(
        'The stage that ends the interview has no heading in Japanese. The protocol can’t be downloaded until it’s added.',
      ),
    ).toBeInTheDocument();
  });
});
