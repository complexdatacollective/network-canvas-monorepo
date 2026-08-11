import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import {
  useContext,
  type ContextType,
  type ReactNode,
  type ReactElement,
} from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';

// The register-effect churn under test only bites while the field is MOUNTED,
// and both fields live inside toggleable `Section`s that start collapsed for a
// row with no pre-edit value. Render children unconditionally so the fields
// mount without driving the toggle UI.
vi.mock('~/components/EditorLayout', () => ({
  Section: ({
    children,
    title,
  }: {
    children: ReactNode;
    title?: ReactNode;
  }) => (
    <div data-testid="section">
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// The stage-form context is irrelevant to registration stability; stub the
// hooks that would otherwise require a mounted `StageFormBridge`.
vi.mock('~/components/StageEditor/stageFormHooks', () => ({
  useCreateVariable: () => ({
    createVariable: async () => undefined,
    deleteVariable: () => undefined,
    normalizeKeyDown: () => undefined,
  }),
  useStageFormValue: () => undefined,
}));

// VariableSpotlight's own UI is not under test.
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

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import PromptFieldsEdges from '../PromptFieldsEdges';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import PromptFieldsLayout from '../PromptFieldsLayout';

const PROTOCOL = {
  schemaVersion: 8,
  name: 'test-protocol',
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          coords: { name: 'Coords', type: 'layout' },
          nickname: { name: 'Nickname', type: 'text' },
        },
      },
    },
    edge: { friend: { name: 'Friend', color: 'edge-color-seq-1' } },
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

// Both fields take a literal `?? []` / default-parameter fallback as
// `initialValue` when the dialog row has no pre-edit value (a NEW prompt).
// `initialValue` is a dependency of `useField`'s register effect, so a fresh
// array identity per render unregisters and re-registers the field on every
// parent re-render — deleting its errors, resetting `isBlurred`, invalidating
// every in-flight validation in the dialog, and leaving phantom
// isTouched/isDirty from the dormant round-trip.
describe('sociogram prompt fields register-effect stability', () => {
  it('registers sortOrder exactly once across re-renders of a new prompt row', () => {
    const { storeApi, rerender } = renderHarness(() => (
      <PromptFieldsLayout entity="node" type="person" />
    ));

    expect(storeApi.getState().fields.has('sortOrder')).toBe(true);
    const counter = countUnregisters(storeApi, 'sortOrder');

    rerender();
    rerender();
    rerender();

    expect(counter.cycles).toBe(0);
    // No dormant round-trip means no phantom touched/dirty on a pristine row.
    const meta = storeApi.getState().getFieldState('sortOrder')?.meta;
    expect(meta?.isTouched).toBe(false);
    expect(meta?.isDirty).toBe(false);
  });

  it('registers edges.display exactly once across re-renders and a checkbox toggle', () => {
    const { storeApi, rerender } = renderHarness(() => <PromptFieldsEdges />);

    expect(storeApi.getState().fields.has('edges.display')).toBe(true);
    const counter = countUnregisters(storeApi, 'edges.display');

    rerender();
    rerender();

    // The component subscribes to its own field value (`useFormValue`), so a
    // checkbox toggle re-renders it — the churn trigger the dialog actually
    // produces.
    const checkbox = screen.getByRole('checkbox', { name: 'Friend' });
    act(() => {
      checkbox.click();
    });

    expect(counter.cycles).toBe(0);
    expect(storeApi.getState().getFieldState('edges.display')?.value).toEqual([
      'friend',
    ]);
  });
});
