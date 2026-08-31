import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import { useContext, type ContextType, type ReactElement } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    name,
    value,
    onChange,
    options = [],
  }: {
    name?: string;
    value?: unknown;
    onChange?: (value: string) => void;
    options?: { value: string; label: string }[];
  }) => (
    <select
      aria-label={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">-- select --</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));

vi.mock('@codaco/protocol-builder/fields/RichTextField', () => ({
  default: ({
    name,
    value,
    onChange,
  }: {
    name?: string;
    value?: unknown;
    onChange?: (value: string) => void;
  }) => (
    <input
      aria-label={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import PromptFields from '../PromptFields';

const PROTOCOL = {
  schemaVersion: 8,
  name: 'test-protocol',
  codebook: {
    node: {},
    edge: {
      friend: {
        name: 'Friend',
        color: 'edge-color-seq-1',
        variables: {
          strength: {
            name: 'Strength',
            type: 'ordinal',
            options: [
              { label: 'Weak', value: 1 },
              { label: 'Strong', value: 2 },
            ],
          },
        },
      },
    },
  },
  stages: [],
};

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

/**
 * Counts unregister transitions for one field: each churn cycle of the
 * `useField` register effect deletes the field from the store's `fields` map
 * before re-adding it, so a `has -> !has` transition is exactly one cycle.
 */
const countUnregisters = (storeApi: StoreApi, fieldName: string) => {
  const counter = { cycles: 0 };
  storeApi.subscribe((state, prevState) => {
    if (prevState.fields.has(fieldName) && !state.fields.has(fieldName)) {
      counter.cycles += 1;
    }
  });
  return counter;
};

const renderHarness = (makeUi: () => ReactElement) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL }) => state,
      stageEditorDraft: (state = { ui: { liveValues: null } }) => state,
    },
  });

  let storeApi: StoreApi | null = null;
  const CaptureStore = () => {
    storeApi = useContext(FormStoreContext) ?? null;
    return null;
  };

  const wrap = () => (
    <Provider store={store}>
      <FormStoreProvider>
        <CaptureStore />
        {makeUi()}
      </FormStoreProvider>
    </Provider>
  );

  const view = render(wrap());
  if (!storeApi) throw new Error('form store was not captured');

  return {
    storeApi: storeApi as StoreApi,
    /** Re-renders the whole tree with freshly created (but identical) elements. */
    rerender: () => view.rerender(wrap()),
  };
};

// A NEW prompt's dialog row is a bare `{}` (DialogArrayField skips the
// enriching itemSelector for new rows), so `variableOptions` arrives
// undefined and the destructuring default is live. A default of `[]` mints a
// fresh array identity per render, and `initialValue` is a dependency of
// `useField`'s register effect — so every parent re-render (which the
// component produces itself per Options edit via its `useFormValue`
// subscription) unregistered and re-registered the field, wiping array-level
// validation errors and resetting `isBlurred` so validate-on-change never
// engaged while creating a prompt.
describe('tie-strength census PromptFields register-effect stability', () => {
  it('registers variableOptions exactly once across re-renders and an Options edit', () => {
    const { storeApi, rerender } = renderHarness(() => (
      <PromptFields createEdge="friend" edgeVariable="strength" />
    ));

    expect(storeApi.getState().fields.has('variableOptions')).toBe(true);
    const counter = countUnregisters(storeApi, 'variableOptions');

    rerender();
    rerender();

    // The realistic trigger: every row edit in the Options list writes a new
    // whole-array value, which re-renders PromptFields through its
    // `useFormValue(['createEdge', 'edgeVariable', 'variableOptions'])`
    // subscription.
    act(() => {
      storeApi
        .getState()
        .setFieldValue('variableOptions', [{ label: 'Weak', value: 1 }]);
    });

    expect(counter.cycles).toBe(0);
    expect(storeApi.getState().getFieldState('variableOptions')?.value).toEqual(
      [{ label: 'Weak', value: 1 }],
    );
  });
});
