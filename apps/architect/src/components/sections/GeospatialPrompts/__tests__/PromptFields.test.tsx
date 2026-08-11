import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

// The rich text field is a TipTap editor; a plain input carries the value in
// jsdom (the CategoricalBinPrompts test's mock, verbatim in spirit).
vi.mock('~/components/Form/Fields/RichText/Field', () => ({
  default: ({ value }: { value?: unknown }) => (
    <input
      aria-label="Prompt text"
      readOnly
      value={typeof value === 'string' ? value : ''}
    />
  ),
}));

// The spotlight picker and variable window are irrelevant to text seeding.
vi.mock('../../../Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: () => null,
}));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: () => [{}, vi.fn()],
}));
vi.mock('~/selectors/codebook', () => ({
  getVariableOptionsForSubject: () => [],
}));
vi.mock('~/selectors/roleFilters', () => ({
  excludeValidatedUses: () => [],
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import PromptFields from '../PromptFields';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const renderEditor = (rowProps: Record<string, unknown>) => {
  storeApi = null;
  const store = configureStore({ reducer: (state = {}) => state });
  return render(
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true as const })}>
        <CaptureStore />
        {/* DialogArrayField spreads the edited row into the editor component
            (`{...itemValues, ...editorProps}`), so an existing prompt arrives
            as these props. */}
        <PromptFields entity="node" type="person" {...rowProps} />
      </Form>
    </Provider>,
  );
};

describe('GeospatialPrompts PromptFields', () => {
  it('seeds the prompt text from the edited row', () => {
    // Regression: the row's `text` prop was dropped, so an existing prompt
    // opened with its required text field blank — the dialog refused to save
    // any other edit until the researcher re-typed the wording, and retyping
    // risked replacing it. Every sibling prompt editor threads this through
    // (`<PromptText initialValue={text} />`); Geospatial alone did not.
    renderEditor({ text: 'Where were you living?', variable: 'loc' });

    expect(screen.getByLabelText('Prompt text')).toHaveValue(
      'Where were you living?',
    );
    if (!storeApi) throw new Error('form store was not captured');
    // The store carries it too — this is what lets an unrelated edit save
    // without touching the text.
    expect(storeApi.getState().getFormValues().text).toBe(
      'Where were you living?',
    );
  });

  it('starts a brand-new prompt with empty text', () => {
    renderEditor({});

    expect(screen.getByLabelText('Prompt text')).toHaveValue('');
    if (!storeApi) throw new Error('form store was not captured');
    expect(storeApi.getState().getFormValues().text).toBeUndefined();
  });
});
