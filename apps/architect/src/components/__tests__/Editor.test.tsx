import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { reducer as formReducer } from 'redux-form';
import { describe, expect, it } from 'vitest';

import Editor, { useFormContext } from '../Editor';

const ContextProbe = () => {
  const context = useFormContext();
  return (
    <>
      <span data-testid="type">{String(context.initialValues?.type)}</span>
      <span data-testid="has-values">
        {String(Object.hasOwn(context, 'values'))}
      </span>
    </>
  );
};

const renderEditor = () => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <Editor form="stage-editor" initialValues={{ type: 'NameGenerator' }}>
        <ContextProbe />
      </Editor>
    </Provider>,
  );
};

describe('Editor form context', () => {
  it('exposes initial values under initialValues', () => {
    renderEditor();
    expect(screen.getByTestId('type')).toHaveTextContent('NameGenerator');
  });

  it('does not expose a misleading merged values field', () => {
    renderEditor();
    expect(screen.getByTestId('has-values')).toHaveTextContent('false');
  });
});
