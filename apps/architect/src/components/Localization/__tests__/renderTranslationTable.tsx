import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ContextType, useContext } from 'react';
import { Provider } from 'react-redux';
import { vi } from 'vitest';

import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import TranslationTable from '../TranslationTable';

type TableForm = NonNullable<ContextType<typeof FormStoreContext>>;

/**
 * Mounts the translation table over a copy of `protocol`, as the
 * Localization page does: in its own form, with the protocol as the active
 * one.
 */
export const renderTranslationTable = (protocol: CurrentProtocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(protocol)));
  const onSaved = vi.fn();
  const forms: TableForm[] = [];
  const FormProbe = () => {
    const form = useContext(FormStoreContext);
    if (form && !forms.includes(form)) forms.push(form);
    return null;
  };
  render(
    <Provider store={store}>
      <FormStoreProvider>
        <FormProbe />
        <TranslationTable onSaved={onSaved} onCancel={vi.fn()} />
      </FormStoreProvider>
    </Provider>,
  );
  /** The table's form, which holds each edited cell's text. */
  const form = () => {
    const [only] = forms;
    if (!only) throw new Error('No form');
    return only;
  };
  return { store, onSaved, form, user: userEvent.setup() };
};

export type RenderedTable = ReturnType<typeof renderTranslationTable>;
